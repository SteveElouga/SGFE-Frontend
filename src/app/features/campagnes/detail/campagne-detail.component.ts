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
  AgentAffecte,
  Campagne,
  Progression,
  Releve,
  ResumeCloture,
  ZoneRepartition,
  campagneStatutTone,
  formatPeriodeCampagne,
  releveStatutTone,
} from '../../../shared/models/campagne.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { AgentsSheetComponent } from '../agents-sheet/agents-sheet.component';
import { ZonesSheetComponent } from '../zones-sheet/zones-sheet.component';
import { AbonnesSheetComponent } from '../abonnes-sheet/abonnes-sheet.component';
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
    ZonesSheetComponent,
    AbonnesSheetComponent,
    TranslatePipe,
    BadgeComponent,
    SkeletonComponent,
  ],
  templateUrl: './campagne-detail.component.html',
  styleUrl: './campagne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Fermeture au clavier de la modale de clôture (équivalent du clic sur le fond).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class CampagneDetailComponent implements OnInit {
  /** Exposés au template pour la teinte des puces de statut. */
  protected readonly campagneStatutTone = campagneStatutTone;
  protected readonly releveStatutTone = releveStatutTone;

  private readonly service = inject(CampagnesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly campagneId: string;
  private campagneQuery!: QueryRef<{ campagne: Campagne }>;

  // ── Agents affectés & répartition (queries backend dédiées) ──────────────
  readonly showAgentsSheet = signal(false);
  readonly agentsData = signal<AgentAffecte[]>([]);
  readonly repartData = signal<ZoneRepartition[]>([]);
  readonly assignedUsernames = computed(() => this.agentsData().map((a) => a.username));

  openAgentsSheet(): void {
    this.showAgentsSheet.set(true);
  }

  closeAgentsSheet(): void {
    this.showAgentsSheet.set(false);
  }

  // ── Affectation des zones (par agent) ────────────────────────────────────────
  readonly showZonesSheet = signal(false);
  readonly zonesAgent = signal<{ id: string; username: string } | null>(null);

  openZonesSheet(agent: { id: string; username: string }): void {
    this.zonesAgent.set(agent);
    this.showZonesSheet.set(true);
  }

  closeZonesSheet(): void {
    this.showZonesSheet.set(false);
  }

  /** Recharge agents + répartition après affectation des zones. */
  onZonesSaved(): void {
    void this.loadAgents();
  }

  // ── Rattachement d'abonnés à une campagne déjà créée (#6) ─────────────────
  readonly showAbonnesSheet = signal(false);

  openAbonnesSheet(): void {
    this.showAbonnesSheet.set(true);
  }

  closeAbonnesSheet(): void {
    this.showAbonnesSheet.set(false);
  }

  // ── État ───────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly progression = signal<Progression | null>(null);
  readonly releves = signal<Releve[]>([]);
  readonly cloturant = signal(false);
  readonly demarrant = signal(false);

  // ── Modal de clôture (écran 18) ──────────────────────────────────────────────
  readonly clotureModalVisible = signal(false);
  readonly clotureConfirme = signal(false);
  readonly tarifActuel = signal<Tarif | null>(null);
  /** Ventilation autoritative chargée à l'ouverture de la modale (null → repli heuristique). */
  readonly resumeCloture = signal<ResumeCloture | null>(null);

  /**
   * Compteurs de la modale de clôture : privilégie `resumeCloture` (backend
   * autoritatif, écran 18) et retombe sur l'agrégat client `relevesByStatut`
   * si absent (non chargé ou rôle sans accès).
   */
  readonly clotureStats = computed(() => {
    const r = this.resumeCloture();
    if (r) {
      return {
        releve: r.nbReleves,
        estime: r.nbEstimes,
        nonReleve: r.nbNonReleves,
        aRelever: r.nbRestants,
        facturesAGenerer: r.nbFacturesAGenerer,
      };
    }
    const h = this.relevesByStatut();
    return {
      releve: h.releve,
      estime: h.estime,
      nonReleve: h.nonReleve,
      aRelever: h.aRelever,
      facturesAGenerer: h.releve + h.estime,
    };
  });

  readonly facturesAGenerer = computed(() => this.clotureStats().facturesAGenerer);
  readonly sansReleve = computed(() => {
    const s = this.clotureStats();
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
    const agents = this.agentsData();
    return agents.length ? agents.map((a) => a.username).join(' · ') : null;
  });

  // Cartes « Agents affectés » — alimentées par la query `agentsCampagne`
  // (total abonnés par agent dérivé de la répartition par zone).
  readonly agentsAffectes = computed(() => {
    const repart = this.repartData();
    return this.agentsData().map((a) => {
      const total = repart
        .filter((z) => z.agentId === a.agentId)
        .reduce((s, z) => s + (z.nbAbonnes ?? 0), 0);
      const done = a.nbReleves ?? 0;
      return {
        id: a.agentId,
        username: a.username,
        initials: this.agentInitials(a.username),
        statut: a.statut,
        zones: (a.zones ?? []).map((z) => ({ nom: z.quartier, camp: z.camp })),
        nbReleves: done,
        nbAbonnes: total,
        pct: total ? Math.round((done / total) * 100) : 0,
        syncLe: a.derniereActivite,
      };
    });
  });

  private agentInitials(username: string): string {
    const parts = username.split(/[._\- ]/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2);
    return s.toUpperCase();
  }

  // Statut de tournée : le backend renvoie une chaîne libre → normalisation
  // tolérante (variantes de casse/format).
  agentStatutClass(statut: string | null): string {
    const s = (statut ?? '').toUpperCase();
    if (s.includes('TOURN')) return 'agent-statut--tournee';
    if (s.includes('RETARD')) return 'agent-statut--retard';
    if (s.includes('ACTIF') || s.includes('ACTIVE')) return 'agent-statut--actif';
    return 'agent-statut--inactif';
  }

  agentStatutLabel(statut: string | null): string {
    const s = (statut ?? '').toUpperCase();
    let key: string | null = null;
    if (s.includes('TOURN')) key = 'EN_TOURNEE';
    else if (s.includes('RETARD')) key = 'EN_RETARD';
    else if (s.includes('ACTIF') || s.includes('ACTIVE')) key = 'ACTIF';
    else if (!s || s.includes('INACTIF')) key = 'INACTIF';
    return key ? this.translate.instant(`CAMPAGNES.AGENT_STATUT.${key}`) : (statut ?? '');
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

  // Répartition par zone — query backend `repartitionParZone` (inclut l'agent).
  readonly repartitionZones = computed(() =>
    this.repartData().map((z) => ({
      key: `${z.quartier}·${z.camp ?? '—'}·${z.agentId ?? ''}`,
      quartier: z.quartier,
      camp: z.camp,
      agentUsername: z.agentUsername,
      agentInitials: z.agentUsername ? this.agentInitials(z.agentUsername) : null,
      abonnes: z.nbAbonnes,
      releves: z.nbReleves,
      pct: Math.round(z.pct ?? 0),
    })),
  );

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
      // Carte des abonnés (filtre par quartier / zones) réservée aux écrans
      // ADMIN/SUPERVISEUR : la query `abonnesActifs` est refusée à l'AGENT (#14),
      // inutile de la déclencher (et de logger un PERMISSION_DENIED) pour lui.
      if (this.canActOnCampagne()) this.loadAbonnesMap();
      void this.loadAgents();
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

  // Agents affectés + répartition par zone — non bloquant (la page reste
  // fonctionnelle si ces queries échouent).
  private async loadAgents(): Promise<void> {
    const [agents, repart] = await Promise.allSettled([
      this.service.getAgentsCampagne(this.campagneId),
      this.service.getRepartitionZone(this.campagneId),
    ]);
    if (agents.status === 'fulfilled') this.agentsData.set(agents.value);
    if (repart.status === 'fulfilled') this.repartData.set(repart.value);
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
    this.resumeCloture.set(null);
    this.clotureModalVisible.set(true);
    // Ventilation autoritative (non bloquant : la modale reste utilisable via l'heuristique).
    this.service
      .getResumeCloture(this.campagneId)
      .then((r) => this.resumeCloture.set(r))
      .catch(() => {
        /* repli sur relevesByStatut */
      });
  }

  closeClotureModal(): void {
    this.clotureModalVisible.set(false);
  }

  /** Escape ferme la modale de clôture (accessibilité clavier). */
  onEscape(): void {
    if (this.clotureModalVisible()) this.closeClotureModal();
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

  /** Démarre à la demande une campagne PLANIFIEE (débloque la saisie des relevés). */
  async demarrer(): Promise<void> {
    if (this.demarrant()) return;
    this.demarrant.set(true);
    try {
      await this.service.demarrerCampagne(this.campagneId);
      await this.load();
      this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_DEMARREE'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.demarrant.set(false);
    }
  }
}
