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
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Apollo, QueryRef } from 'apollo-angular';
import { PROGRESSION_UPDATED_SUB } from '../../../graphql/queries/campagnes.queries';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import { Tarif } from '../../../shared/models/facture.model';
import { AgentAffecte, Progression, ResumeCloture, ZoneRepartition, campagneStatutTone, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { AgentsSheetComponent } from '../agents-sheet/agents-sheet.component';
import { ZonesSheetComponent } from '../zones-sheet/zones-sheet.component';
import { AbonnesSheetComponent } from '../abonnes-sheet/abonnes-sheet.component';
import { CorrigerReleveSheetComponent } from '../corriger-releve-sheet/corriger-releve-sheet.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../../shared/services/toast.service';
import { ClotureModalComponent } from './cloture-modal/cloture-modal.component';
import { RelevesPanelComponent } from './releves-panel/releves-panel.component';
import { AgentsPanelComponent } from './agents-panel/agents-panel.component';
import type { ProgressionUpdatedSubscription } from '../../../graphql/generated';
import type { CampagneDetail, ReleveLigne } from '../../../graphql/vues';
import type { CorrigerReleveMutation, GetCampagneQuery } from '../../../graphql/generated';

@Component({
  selector: 'app-campagne-detail',
  imports: [
    DatePipe,
    ErrorBannerComponent,
    AgentsSheetComponent,
    ZonesSheetComponent,
    AbonnesSheetComponent,
    CorrigerReleveSheetComponent,
    PageTopbarComponent,
    TranslatePipe,
    BadgeComponent,
    SkeletonComponent,
    ClotureModalComponent,
    RelevesPanelComponent,
    AgentsPanelComponent,
  ],
  templateUrl: './campagne-detail.component.html',
  styleUrl: './campagne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneDetailComponent implements OnInit {
  /** Exposé au template pour la teinte du badge de statut de la campagne. */
  protected readonly campagneStatutTone = campagneStatutTone;

  private readonly apollo = inject(Apollo);

  private readonly service = inject(CampagnesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly campagneId: string;
  private campagneQuery!: QueryRef<GetCampagneQuery>;

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

  // ── Correction d'un index déjà relevé ────────────────────────────────────────
  readonly showCorrigerReleveSheet = signal(false);
  readonly releveACorrig = signal<ReleveLigne | null>(null);

  openCorrigerReleveSheet(r: ReleveLigne): void {
    this.releveACorrig.set(r);
    this.showCorrigerReleveSheet.set(true);
  }

  closeCorrigerReleveSheet(): void {
    this.showCorrigerReleveSheet.set(false);
  }

  /** Applique localement le résultat de la correction — pas de rechargement
   * complet nécessaire, la mutation renvoie déjà l'état final du relevé. */
  onReleveCorrige(result: CorrigerReleveMutation['corrigerReleve']): void {
    this.releves.update((list) =>
      list.map((r) =>
        r.abonneId === this.releveACorrig()?.abonneId
          ? { ...r, nouveauIndex: result.nouveauIndex, consommation: result.consommation, statut: result.statut }
          : r,
      ),
    );
    this.showCorrigerReleveSheet.set(false);
    this.toast.success(this.translate.instant('CAMPAGNES.CORRIGER_RELEVE.SUCCESS'));
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
  readonly campagne = signal<CampagneDetail | null>(null);
  readonly progression = signal<Progression | null>(null);
  readonly releves = signal<ReleveLigne[]>([]);
  readonly demarrant = signal(false);

  // ── Modal de clôture (écran 18) ──────────────────────────────────────────────
  // Le contenu (stats, confirmation, action de clôture) vit dans
  // <app-cloture-modal> — ce composant garde seulement l'ouverture/fermeture
  // et les données pré-chargées qu'elle consomme en entrée.
  readonly clotureModalVisible = signal(false);
  readonly tarifActuel = signal<Tarif | null>(null);
  /** Ventilation autoritative chargée à l'ouverture de la modale (null → repli heuristique). */
  readonly resumeCloture = signal<ResumeCloture | null>(null);

  // abonneId → quartier, populated after load
  readonly abonnesMap = signal<Map<string, string>>(new Map());
  // abonneId → zone (quartier + camp), pour la répartition par zone
  readonly abonneZones = signal<Map<string, { quartier: string; camp: number | null }>>(new Map());

  readonly periode = computed(() => {
    const c = this.campagne();
    const lang = this.translate.currentLang() ?? 'fr';
    return c ? formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang) : '';
  });

  /** Titre du topbar : nom de la campagne quand chargée, "…" pendant loading. */
  readonly topbarTitle = computed(() => {
    const c = this.campagne();
    return c ? c.nom : this.translate.instant('COMMON.LOADING');
  });

  /** Sous-titre : statut + date d'ancrage (cloturée → dateCloture, sinon dateCreation). */
  readonly topbarSubtitle = computed(() => {
    const c = this.campagne();
    if (!c) return '';
    const lang = this.translate.currentLang() ?? 'fr';

    // Une campagne clôturée écrivait « Clôturée · Clôturée le 27/08 » : le même
    // mot deux fois dans la même ligne, à trois centimètres d'écart. Le libellé
    // de date le porte déjà — le statut n'a pas à le précéder.
    if (c.statut === 'CLOTUREE' && c.dateCloture) {
      return `${this.translate.instant('CAMPAGNES.CLOTURE_LE', {}, lang)} ${this.formatShortDate(c.dateCloture)}`;
    }

    const statut = this.translate.instant('CAMPAGNES.STATUT.' + c.statut, {}, lang);
    const creeLe = `${this.translate.instant('CAMPAGNES.CREE_LE', {}, lang)} ${this.formatShortDate(c.dateCreation)}`;
    return `${statut} · ${creeLe}`;
  });

  /** Formatte une date en dd/MM (locale-agnostic pour la topbar). */
  private formatShortDate(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  readonly pourcentageAffiche = computed(() =>
    Math.round(this.progression()?.pourcentage ?? 0),
  );

  readonly canActOnCampagne = computed(
    () => this.auth.isAdmin() || this.auth.isSuperviseur(),
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

  // Les cartes agents, la répartition par zone (<app-agents-panel>) et les
  // filtres/table des relevés (<app-releves-panel>) sont désormais des
  // sous-composants — ce composant garde `agentsData`/`repartData`/`releves`/
  // `abonnesMap`, qui servent aussi ailleurs (agentsLabel, assignedUsernames,
  // la carte progression, la modale de clôture), et se contente de les
  // passer en entrée.

  constructor(route: ActivatedRoute) {
    this.campagneId = route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.campagneQuery = this.service.watchCampagne(this.campagneId);

    this.campagneQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          if (data?.campagne) this.campagne.set(data.campagne as CampagneDetail);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
          this.loading.set(false);
        },
      });

    // ── La progression, en direct ─────────────────────────────────────────
    //
    // Elle était chargée une fois et ne bougeait plus. Or c'est le seul chiffre
    // de cet écran qu'on regarde *pendant* qu'il change : un responsable ouvre
    // la fiche d'une campagne en cours précisément pour voir les relevés
    // arriver. Sans cela, il rafraîchit la page à la main pour savoir si son
    // équipe avance — ou pire, il conclut qu'elle n'avance pas.
    //
    // Le flux existait des deux côtés depuis le début ; personne ne s'y était
    // abonné.
    this.apollo
      .subscribe<ProgressionUpdatedSubscription>({ query: PROGRESSION_UPDATED_SUB,
        variables: { campagneId: this.campagneId },
        // Échec silencieux : une progression figée reste lisible, alors qu'un
        // bandeau d'erreur sur un flux d'agrément couvrirait l'écran pour rien.
        context: { silentError: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const p = data?.progressionUpdated;
          if (p) this.progression.set(p);
        },
        error: () => {
          /* temps réel indisponible — l'écran garde la valeur chargée */
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
      // Tarif actuel = aperçu de clôture (action ADMIN/SUPERVISEUR uniquement),
      // et query réservée ADMIN/SUPERVISEUR côté gateway → ne pas la déclencher
      // pour l'AGENT (sinon PERMISSION_DENIED + toast global).
      if (this.canActOnCampagne()) {
        void this.facturesService
          .getTarifActuel()
          .then((t) => this.tarifActuel.set(t))
          .catch(() => undefined);
      }
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

  /** Clôture réussie (remontée par `<app-cloture-modal>`) : ferme, recharge,
   *  puis affiche le succès — même ordre que l'ancien `cloturer()` local. */
  async onCloture(): Promise<void> {
    this.clotureModalVisible.set(false);
    await this.load();
    this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_CLOTUREE'));
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
