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
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { BACKEND_CAPABILITIES } from '../../../core/config/backend-capabilities';
import { extractGqlError } from '../../../core/auth/auth.service';
import { ZoneInput, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { GET_ABONNES_ACTIFS } from '../../../graphql/queries/abonnes.queries';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../../shared/services/toast.service';

interface Agent {
  id: string;
  username: string;
  role: string;
}

interface AbonneActif {
  id: string;
  compteur?: {
    quartier: string;
    camp: number;
  };
}

@Component({
  selector: 'app-campagne-form',
  imports: [FormsModule, PageTopbarComponent, TranslatePipe],
  templateUrl: './campagne-form.component.html',
  styleUrl: './campagne-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneFormComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly apollo = inject(Apollo);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  readonly destroyRef = inject(DestroyRef);

  // ── Agents ─────────────────────────────────────────────────────────────────
  readonly agents = signal<Agent[]>([]);
  readonly selectedAgentIds = signal<Set<string>>(new Set());
  // Zones (clé quartier##camp) affectées à chaque agent sélectionné. Vide =
  // l'agent couvre toute la campagne (aucune restriction, cf. list_tournee).
  readonly agentZones = signal<Map<string, Set<string>>>(new Map());

  readonly selectedAgents = computed(() =>
    this.agents().filter((a) => this.selectedAgentIds().has(a.id)),
  );
  readonly availableAgents = computed(() =>
    this.agents().filter((a) => !this.selectedAgentIds().has(a.id)),
  );

  // ── Abonnés ─────────────────────────────────────────────────────────────────
  readonly abonnesActifs = signal<AbonneActif[] | null>(null);
  readonly nbAbonnesActifs = computed(() => this.abonnesActifs()?.length ?? null);

  // Zones disponibles = paires (quartier, camp), dédupliquées depuis les
  // compteurs des abonnés actifs. La granularité métier d'une zone est
  // (quartier, camp) partout (proto Zone, affectation d'agents) : filtrer sur le
  // seul quartier rattacherait d'un coup tous les camps du quartier.
  readonly zonesDisponibles = computed(() => {
    const abonnes = this.abonnesActifs();
    if (!abonnes) return [];
    const map = new Map<string, { quartier: string; camp: number; count: number }>();
    for (const a of abonnes) {
      const quartier = a.compteur?.quartier?.trim() ?? '';
      if (!quartier) continue;
      const camp = a.compteur!.camp;
      const key = this.zoneKey(quartier, camp);
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { quartier, camp, count: 1 });
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.quartier.localeCompare(b.quartier, 'fr') || a.camp - b.camp);
  });

  // Zones sélectionnées (mode FILTRE)
  readonly selectedZones = signal<Set<string>>(new Set());

  // Nb abonnés couverts selon le mode de sélection
  readonly nbAbonnesFiltres = computed(() => {
    const abonnes = this.abonnesActifs();
    if (!abonnes) return 0;
    if (this.selectionMode() === 'TOUS') return abonnes.length;
    const zones = this.selectedZones();
    if (zones.size === 0) return 0;
    return abonnes.filter((a) => this.abonneDansZones(a, zones)).length;
  });

  // ── Identification ──────────────────────────────────────────────────────────
  readonly formNom = signal('');
  readonly formDatePlanifiee = signal('');

  // ── Abonnés sélection ───────────────────────────────────────────────────────
  readonly selectionMode = signal<'TOUS' | 'FILTRE'>('TOUS');
  /**
   * Le mode FILTRE ne rattache que les abonnés des zones cochées, via
   * `ajouterAbonnesCampagne(abonneIds)` (ids résolus côté client dans
   * `resolveAbonneIds()`). Voir `backend-capabilities.ts`.
   */
  readonly filtreZonesReady = BACKEND_CAPABILITIES.CAMPAGNE_FILTRE_ZONES;

  selectSelectionMode(mode: 'TOUS' | 'FILTRE'): void {
    if (mode === 'FILTRE' && !this.filtreZonesReady) return;
    this.selectionMode.set(mode);
  }

  // ── Options ─────────────────────────────────────────────────────────────────
  readonly genererFacturesAuto = signal(true);
  readonly envoyerWhatsappAuto = signal(true);
  /**
   * Démarre la campagne (→ EN_COURS) juste après sa création. Requis pour que
   * les agents puissent saisir (`saisirIndex` exige EN_COURS). Laisser décoché
   * si l'on veut d'abord affecter des zones aux agents depuis le détail
   * (l'ordre correct est : rattacher abonnés → affecter zones → démarrer).
   */
  readonly demarrerMaintenant = signal(false);
  readonly formMobileMoney = signal('');

  // Mobile Money : 9 chiffres exactement ou vide
  readonly mobileMoneyValid = computed(() => {
    const v = this.formMobileMoney().trim();
    return v === '' || /^\d{9}$/.test(v);
  });

  // envoyerWhatsappAuto forcé à false si genererFacturesAuto est off
  readonly envoyerWhatsappEffectif = computed(() =>
    this.genererFacturesAuto() ? this.envoyerWhatsappAuto() : false,
  );

  // ── Submit ──────────────────────────────────────────────────────────────────
  readonly submitting = signal(false);

  readonly formValid = computed(() => {
    const nomOk = this.formNom().trim().length > 0;
    const dateOk = this.formDatePlanifiee().length > 0;
    const abonnesOk =
      this.selectionMode() === 'TOUS' || this.selectedZones().size > 0;
    return nomOk && dateOk && abonnesOk && this.mobileMoneyValid();
  });

  readonly submitLabel = computed(() => {
    const nom = this.formNom().trim();
    const prefix = this.translate.instant('CAMPAGNES.FORM.SUBMIT_PREFIX');
    return nom ? `${prefix} ${nom}` : prefix;
  });

  ngOnInit(): void {
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);

    const mois = next.getMonth() + 1;
    const annee = next.getFullYear();
    this.formNom.set(formatPeriodeCampagne(mois, annee));
    this.formDatePlanifiee.set(next.toISOString().split('T')[0]);

    void this.loadAgents();
    this.loadAbonnesActifs();
  }

  private async loadAgents(): Promise<void> {
    try {
      // `agentsDisponibles` est accessible à ADMIN **et** SUPERVISEUR (au
      // contraire de `users`, réservé ADMIN → un superviseur n'aurait aucun
      // agent proposé).
      const agents = await this.service.getAgentsDisponibles();
      this.agents.set(
        agents
          .filter((a) => a.isActive)
          .map((a) => ({ id: a.id, username: a.username, role: a.role })),
      );
    } catch {
      // agents non critiques
    }
  }

  private loadAbonnesActifs(): void {
    this.apollo
      .watchQuery<{ abonnesActifs: AbonneActif[] }>({
        query: GET_ABONNES_ACTIFS,
        fetchPolicy: 'cache-first',
      })
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          if (data?.abonnesActifs) {
            this.abonnesActifs.set(data.abonnesActifs as AbonneActif[]);
          }
        },
        error: () => this.abonnesActifs.set([]),
      });
  }

  toggleAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selectedAgentIds.set(set);
  }

  removeAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    set.delete(id);
    this.selectedAgentIds.set(set);
    const az = new Map(this.agentZones());
    az.delete(id);
    this.agentZones.set(az);
  }

  // ── Zones par agent (affectation dès la création) ────────────────────────────
  isAgentZoneSelected(agentId: string, key: string): boolean {
    return this.agentZones().get(agentId)?.has(key) ?? false;
  }

  agentZoneCount(agentId: string): number {
    return this.agentZones().get(agentId)?.size ?? 0;
  }

  toggleAgentZone(agentId: string, key: string): void {
    const az = new Map(this.agentZones());
    const set = new Set(az.get(agentId) ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    az.set(agentId, set);
    this.agentZones.set(az);
  }

  /** Zones (quartier, camp) choisies pour un agent, prêtes pour affecterZones. */
  private zonesForAgent(agentId: string): ZoneInput[] {
    const keys = this.agentZones().get(agentId);
    if (!keys || keys.size === 0) return [];
    return this.zonesDisponibles()
      .filter((z) => keys.has(z.key))
      .map((z) => ({ quartier: z.quartier, camp: z.camp }));
  }

  toggleZone(key: string): void {
    const set = new Set(this.selectedZones());
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.selectedZones.set(set);
  }

  /** Clé d'une zone = paire (quartier, camp), cohérente avec le backend. */
  private zoneKey(quartier: string, camp: number): string {
    return `${quartier}##${camp}`;
  }

  /** Un abonné appartient-il à l'une des zones (quartier, camp) sélectionnées ? */
  private abonneDansZones(a: AbonneActif, zones: Set<string>): boolean {
    const quartier = a.compteur?.quartier?.trim() ?? '';
    return quartier !== '' && zones.has(this.zoneKey(quartier, a.compteur!.camp));
  }

  /** Ids des abonnés à rattacher selon le mode (TOUS = tous les actifs). */
  private resolveAbonneIds(): string[] {
    const abonnes = this.abonnesActifs() ?? [];
    if (this.selectionMode() === 'TOUS') return abonnes.map((a) => a.id);
    const zones = this.selectedZones();
    return abonnes.filter((a) => this.abonneDansZones(a, zones)).map((a) => a.id);
  }

  async submit(): Promise<void> {
    if (!this.formValid() || this.submitting()) return;
    this.submitting.set(true);
    try {
      // 1) créer (directement EN_COURS si « démarrer maintenant », via le flag
      // natif atomique #11) → 2) rattacher les abonnés (crée leurs relevés
      // A_RELEVER, sinon « 0 abonné à relever ») → 3) affecter les agents.
      // Rattachement et affectation restent valides sur une campagne EN_COURS.
      const date = new Date(this.formDatePlanifiee());
      const campagne = await this.service.creerCampagne({
        nom: this.formNom().trim(),
        periodeMois: date.getMonth() + 1,
        periodeAnnee: date.getFullYear(),
        datePlanifiee: this.formDatePlanifiee(),
        numeroMobileMoney: this.formMobileMoney().trim(),
        genererFacturesAuto: this.genererFacturesAuto(),
        envoyerWhatsappAuto: this.envoyerWhatsappEffectif(),
        demarrerMaintenant: this.demarrerMaintenant(),
      });

      const abonneIds = this.resolveAbonneIds();
      if (abonneIds.length > 0) {
        await this.service.ajouterAbonnesCampagne(campagne.campagneId, abonneIds);
      }

      for (const agentId of this.selectedAgentIds()) {
        const zones = this.zonesForAgent(agentId);
        if (zones.length > 0) {
          // affecterZones rattache aussi l'agent à la campagne (assigner) : pas
          // besoin d'un affecterAgent séparé quand des zones sont choisies.
          await this.service.affecterZones(campagne.campagneId, agentId, zones);
        } else {
          await this.service.affecterAgent(campagne.campagneId, agentId);
        }
      }

      this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_CREE'));
      await this.router.navigate(['/campagnes']);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.submitting.set(false);
    }
  }

  annuler(): void {
    void this.router.navigate(['/campagnes']);
  }
}
