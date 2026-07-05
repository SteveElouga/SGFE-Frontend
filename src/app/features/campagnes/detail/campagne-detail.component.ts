import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, LowerCasePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { QueryRef } from 'apollo-angular';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import { Tarif } from '../../../shared/models/facture.model';
import {
  Campagne,
  Progression,
  Releve,
  formatPeriodeCampagne,
} from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { AgentsSheetComponent } from '../agents-sheet/agents-sheet.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-campagne-detail',
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    LowerCasePipe,
    SlicePipe,
    FormsModule,
    SelectModule,
    ErrorBannerComponent,
    AgentsSheetComponent,
    TranslatePipe,
  ],
  templateUrl: './campagne-detail.component.html',
  styleUrl: './campagne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneDetailComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly campagneId: string;
  private campagneQuery!: QueryRef<{ campagne: Campagne }>;

  // ── Affectation d'agents (MC-03) ─────────────────────────────────────────
  readonly showAgentsSheet = signal(false);
  readonly assignedUsernames = computed(
    () => this.campagne()?.agents?.map((a) => a.username) ?? [],
  );

  openAgentsSheet(): void {
    this.showAgentsSheet.set(true);
  }

  closeAgentsSheet(): void {
    this.showAgentsSheet.set(false);
  }

  // ── État ───────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly progression = signal<Progression | null>(null);
  readonly releves = signal<Releve[]>([]);
  readonly cloturant = signal(false);

  // ── Modal de clôture (écran 18) ──────────────────────────────────────────────
  readonly clotureModalVisible = signal(false);
  readonly clotureConfirme = signal(false);
  readonly tarifActuel = signal<Tarif | null>(null);

  readonly facturesAGenerer = computed(() => {
    const s = this.relevesByStatut();
    return s.releve + s.estime;
  });
  readonly sansReleve = computed(() => {
    const s = this.relevesByStatut();
    return s.aRelever + s.nonReleve;
  });

  // ── Filtres relevés ────────────────────────────────────────────────────────
  readonly filtreReleveStatut = signal('TOUS');
  readonly filtreQuartier = signal<string | null>(null);
  // abonneId → quartier, populated after load
  readonly abonnesMap = signal<Map<string, string>>(new Map());
  // abonneId → zone (quartier + camp), pour la répartition par zone
  readonly abonneZones = signal<Map<string, { quartier: string; camp: number | null }>>(new Map());

  readonly periode = computed(() => {
    const c = this.campagne();
    const lang = this.translate.currentLang() ?? 'fr';
    return c ? formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang) : '';
  });

  readonly pourcentageAffiche = computed(() =>
    Math.round(this.progression()?.pourcentage ?? 0),
  );

  readonly canActOnCampagne = computed(
    () => this.auth.isAdmin() || this.auth.role() === 'SUPERVISEUR',
  );

  readonly relevesByStatut = computed(() => {
    const list = this.releves();
    return {
      aRelever: list.filter((r) => r.statut === 'A_RELEVER').length,
      releve: list.filter((r) => r.statut === 'RELEVE').length,
      nonReleve: list.filter((r) => r.statut === 'NON_RELEVE').length,
      estime: list.filter((r) => r.statut === 'ESTIME').length,
    };
  });

  readonly agentsLabel = computed(() => {
    const agents = this.campagne()?.agents;
    return agents?.length ? agents.map((a) => a.username).join(' · ') : null;
  });

  // Cartes « Agents affectés » (maquette Détail campagne). Alimentées par
  // `campagne.agents` — VIDE tant que le backend n'expose pas ce champ
  // (état « en attente » affiché). Voir docs/BESOINS_API_campagne_agents.md.
  readonly agentsAffectes = computed(() =>
    (this.campagne()?.agents ?? []).map((a) => {
      const total = a.nbAbonnesAssignes ?? 0;
      const done = a.nbReleves ?? 0;
      return {
        id: a.id ?? a.username,
        username: a.username,
        initials: this.agentInitials(a.username),
        statut: a.statutTournee ?? null,
        zones: a.zones ?? [],
        nbReleves: done,
        nbAbonnes: total,
        pct: total ? Math.round((done / total) * 100) : 0,
        syncLe: a.derniereSyncLe ?? null,
      };
    }),
  );

  private agentInitials(username: string): string {
    const parts = username.split(/[._\- ]/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2);
    return s.toUpperCase();
  }

  agentStatutClass(statut: string | null): string {
    switch (statut) {
      case 'EN_TOURNEE': return 'agent-statut--tournee';
      case 'ACTIF': return 'agent-statut--actif';
      case 'EN_RETARD': return 'agent-statut--retard';
      default: return 'agent-statut--inactif';
    }
  }

  agentStatutLabel(statut: string | null): string {
    const key = statut ? `CAMPAGNES.AGENT_STATUT.${statut}` : 'CAMPAGNES.AGENT_STATUT.INACTIF';
    return this.translate.instant(key);
  }

  agentSyncLabel(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const lang = this.translate.currentLang() ?? undefined;
    const min = Math.floor(diff / 60000);
    if (min < 1) return this.translate.instant('CAMPAGNES.SYNC_NOW', {}, lang);
    if (min < 60) return this.translate.instant('CAMPAGNES.SYNC_MIN', { n: min }, lang);
    const h = Math.floor(min / 60);
    if (h < 24) return this.translate.instant('CAMPAGNES.SYNC_HOUR', { n: h }, lang);
    return this.translate.instant('CAMPAGNES.SYNC_DAY', { n: Math.floor(h / 24) }, lang);
  }

  readonly statutReleveOptions = computed(() => [
    { label: this.translate.instant('CAMPAGNES.FILTRE_STATUT_RELEVE'), value: 'TOUS' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.RELEVE'), value: 'RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.ESTIME'), value: 'ESTIME' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.NON_RELEVE'), value: 'NON_RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.A_RELEVER'), value: 'A_RELEVER' },
  ]);

  readonly quartiersDisponibles = computed(() => {
    const map = this.abonnesMap();
    const releves = this.releves();
    const set = new Set<string>();
    releves.forEach((r) => {
      const q = map.get(r.abonneId);
      if (q) set.add(q);
    });
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('CAMPAGNES.FILTRE_QUARTIER', {}, lang), value: null },
      ...[...set].sort((a, b) => a.localeCompare(b, 'fr')).map((q) => ({ label: q, value: q })),
    ];
  });

  // Répartition par zone (quartier · camp) — dérivée des relevés réels.
  // Abonnés = relevés de la zone ; Relevés = statuts RELEVE/ESTIME.
  // (Colonne « Agent » différée : nécessite la lecture des affectations
  //  d'agents, non exposée par le backend — cf. docs/BESOINS_API_campagne_agents.md.)
  readonly repartitionZones = computed(() => {
    const zoneMap = this.abonneZones();
    const groups = new Map<
      string,
      { key: string; quartier: string; camp: number | null; abonnes: number; releves: number }
    >();
    for (const r of this.releves()) {
      const z = zoneMap.get(r.abonneId);
      if (!z) continue;
      const key = `${z.quartier}·${z.camp ?? '—'}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, quartier: z.quartier, camp: z.camp, abonnes: 0, releves: 0 };
        groups.set(key, g);
      }
      g.abonnes++;
      if (r.statut === 'RELEVE' || r.statut === 'ESTIME') g.releves++;
    }
    return [...groups.values()]
      .map((g) => ({ ...g, pct: g.abonnes ? Math.round((g.releves / g.abonnes) * 100) : 0 }))
      .sort((a, b) => a.quartier.localeCompare(b.quartier, 'fr') || (a.camp ?? 0) - (b.camp ?? 0));
  });

  readonly relevesFiltres = computed(() => {
    let list = this.releves();
    const statut = this.filtreReleveStatut();
    if (statut !== 'TOUS') list = list.filter((r) => r.statut === statut);
    const quartier = this.filtreQuartier();
    if (quartier) {
      const map = this.abonnesMap();
      list = list.filter((r) => map.get(r.abonneId) === quartier);
    }
    return list;
  });

  constructor(route: ActivatedRoute) {
    this.campagneId = route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.campagneQuery = this.service.watchCampagne(this.campagneId);

    this.campagneQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          if (data?.campagne) this.campagne.set(data.campagne as Campagne);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
          this.loading.set(false);
        },
      });

    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [campagneResult, progression, releves] = await Promise.all([
        this.campagneQuery.refetch(),
        this.service.getProgression(this.campagneId),
        this.service.getReleves(this.campagneId),
      ]);
      this.campagne.set(campagneResult.data!.campagne);
      this.progression.set(progression);
      this.releves.set(releves);
      this.loadAbonnesMap();
      void this.facturesService
        .getTarifActuel()
        .then((t) => this.tarifActuel.set(t))
        .catch(() => undefined);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private loadAbonnesMap(): void {
    this.abonnesService
      .getAbonnesActifs()
      .then((entries) => {
        const map = new Map<string, string>();
        const zones = new Map<string, { quartier: string; camp: number | null }>();
        entries.forEach((e) => {
          if (e.quartier) {
            map.set(e.id, e.quartier);
            zones.set(e.id, { quartier: e.quartier, camp: e.camp });
          }
        });
        this.abonnesMap.set(map);
        this.abonneZones.set(zones);
      })
      .catch(() => {
        // non-critical — filter simply won't populate
      });
  }

  openClotureModal(): void {
    this.clotureConfirme.set(false);
    this.clotureModalVisible.set(true);
  }

  closeClotureModal(): void {
    this.clotureModalVisible.set(false);
  }

  async cloturer(): Promise<void> {
    if (this.cloturant() || !this.clotureConfirme()) return;
    this.cloturant.set(true);
    try {
      await this.service.cloturerCampagne(this.campagneId);
      this.clotureModalVisible.set(false);
      await this.load();
      this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_CLOTUREE'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.cloturant.set(false);
    }
  }
}
