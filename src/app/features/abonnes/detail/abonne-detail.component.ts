import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { Abonne, Compteur, HistoriqueCompteurEntry, StatutAbonne } from '../../../shared/models/abonne.model';
import { SoldeFacture, Facture } from '../../../shared/models/facture.model';
import { nomAbonne } from '../../../shared/utils/abonne.utils';
import { ABONNE_DETAIL_UPDATED_SUB } from '../../../graphql/queries/abonnes.queries';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';
import { formatFcfa } from '../../../shared/pipes/fcfa.pipe';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { RemplacerCompteurSheetComponent } from './remplacer-compteur-sheet/remplacer-compteur-sheet.component';
import { ReactiverSheetComponent } from './reactiver-sheet/reactiver-sheet.component';
import { ResilierSheetComponent } from './resilier-sheet/resilier-sheet.component';
import { SuspendreSheetComponent } from './suspendre-sheet/suspendre-sheet.component';
import { ArriereSheetComponent } from './arriere-sheet/arriere-sheet.component';
import { EncaissementSheetComponent } from '../../../shared/components/encaissement-sheet/encaissement-sheet.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { NomAbonnePipe } from '../../../shared/pipes/nom-abonne.pipe';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { ToastService } from '../../../shared/services/toast.service';
import { KpiGridComponent } from './kpi-grid/kpi-grid.component';
import { FacturesTableComponent } from './factures-table/factures-table.component';
import { CompteursPanelComponent } from './compteurs-panel/compteurs-panel.component';
import type { AbonneDetail, FactureLigne, SoldeDetail } from '../../../graphql/vues';
import type { AbonneDetailUpdatedSubscription, GetAbonneQuery } from '../../../graphql/generated';

@Component({
  imports: [
    DecimalPipe,
    NomAbonnePipe,
    DatePipe,
    TranslatePipe,
    CompteurPipe,
    ErrorBannerComponent,
    TooltipDirective,
    SkeletonComponent,
    RemplacerCompteurSheetComponent,
    ReactiverSheetComponent,
    ResilierSheetComponent,
    SuspendreSheetComponent,
    ArriereSheetComponent,
    EncaissementSheetComponent,
    PageTopbarComponent,
    KpiGridComponent,
    FacturesTableComponent,
    CompteursPanelComponent,
  ],
  templateUrl: './abonne-detail.component.html',
  styleUrl: './abonne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonneDetailComponent {
  private readonly abonnesService = inject(AbonnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly facturePdf = inject(FacturePdfService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  /** Deep-link keys pour les 5 onglets (mêmes indices que activeTab()). */
  private readonly TAB_KEYS = ['info', 'factures', 'conso', 'impayes', 'compteurs'] as const;

  /** Lu par le gabarit pour alimenter les feuilles d'action. */
  protected readonly abonneId: string;
  private readonly abonneQuery: QueryRef<GetAbonneQuery>;

  readonly abonne = signal<AbonneDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statutLoading = signal(false);

  // Onglets
  readonly activeTab = signal(0);

  // Historique compteur (tab 4 — lazy)
  readonly historique = signal<HistoriqueCompteurEntry[]>([]);
  readonly historiqueLoading = signal(false);
  readonly historiqueLoaded = signal(false);
  readonly historiqueError = signal<string | null>(null);

  // Factures de l'abonné (KPIs + onglets Factures/Conso/Impayés)
  readonly factures = signal<FactureLigne[]>([]);
  readonly facturesLoading = signal(false);

  /** Factures triées de la plus récente à la plus ancienne. */
  readonly facturesTriees = computed(() =>
    [...this.factures()].sort(
      (a, b) => new Date(b.dateReleve).getTime() - new Date(a.dateReleve).getTime(),
    ),
  );
  readonly facturesRecentes = computed(() => this.facturesTriees().slice(0, 5));
  readonly facturesImpayees = computed(() =>
    this.facturesTriees().filter((f) => f.statut !== 'PAYEE'),
  );
  readonly nbFactures = computed(() => this.factures().length);

  /**
   * Solde réellement dû par l'abonné.
   *
   * La carte lisait `abonne.soldeImpayes` — un champ que **la gateway n'expose
   * pas** sur le type `Abonne` (vérifié par introspection). Le modèle le
   * déclarait optionnel, donc rien n'a jamais protesté : la carte affichait
   * « — » pour tous les abonnés, à jamais, pendant que l'onglet Factures
   * juste en dessous listait leurs factures impayées.
   *
   * `Facture` ne porte pas le solde non plus — il vit sur `SoldeFacture`. On
   * interroge donc le solde de chaque facture non soldée (une poignée par
   * abonné) et on additionne. `null` tant que rien n'a été chargé : on ne
   * prétend pas qu'un solde inconnu vaut zéro.
   */
  readonly soldeImpaye = signal<number | null>(null);

  /** Feuille de saisie d'un arriéré antérieur à la mise en service. */
  readonly arriereDialogVisible = signal(false);

  /** Feuille d'encaissement — imputation automatique, ventilation annoncée. */
  readonly encaissementDialogVisible = signal(false);

  /**
   * Soldes non éteints de l'abonné, source de la prévisualisation.
   *
   * Chargés en même temps que le solde total : la ventilation a besoin du
   * détail par facture, que `detteAbonne` n'expose pas — il ne renvoie qu'un
   * cumul.
   */
  readonly soldesOuverts = signal<SoldeDetail[]>([]);

  /**
   * Avoir disponible : ce que la régie doit à l'abonné.
   *
   * Le symétrique du solde impayé, et il se lit dans le même geste. Un caissier
   * qui encaisse sans le savoir fait payer deux fois ; un abonné qui voit sa
   * facture suivante réduite sans explication croit à une erreur. Le serveur
   * tenait ce compte depuis le début — aucun écran ne le montrait.
   */
  readonly avoir = signal<number>(0);
  readonly avoirFormate = computed(() => formatFcfa(this.avoir()));

  /** Numéro lisible par identifiant de facture, pour nommer les parts. */
  readonly numerosParFacture = computed(() =>
    Object.fromEntries(this.factures().map((f) => [f.factureId, f.numeroFacture])),
  );

  /** Après création d'un arriéré : la dette et la liste des factures ont changé. */
  async onArriereSaved(): Promise<void> {
    await this.loadFactures();
  }

  /** Après encaissement : les soldes ont bougé, la dette aussi. */
  async onEncaissementSaved(): Promise<void> {
    await this.loadFactures();
  }

  /** Conso moyenne sur les 6 dernières factures (m³), arrondie. */
  readonly consoMoyenne = computed(() => {
    const list = this.facturesTriees().slice(0, 6);
    if (list.length === 0) return null;
    const total = list.reduce((sum, f) => sum + (f.consommation ?? 0), 0);
    return Math.round(total / list.length);
  });

  /** Histogramme conso (6 dernières, du plus ancien au plus récent). */
  readonly consoBars = computed(() => {
    const list = this.facturesTriees().slice(0, 6).reverse();
    const max = Math.max(1, ...list.map((f) => f.consommation ?? 0));
    return list.map((f) => ({
      periode: this.periodeFacture(f),
      conso: f.consommation ?? 0,
      pct: Math.round(((f.consommation ?? 0) / max) * 100),
    }));
  });


  // Modales de statut — formulaires délégués aux composants dédiés
  // (ReactiverSheetComponent / ResilierSheetComponent) ; le parent ne pilote
  // que leur visibilité et applique le résultat.
  readonly reactiverDialogVisible = signal(false);
  readonly resilierDialogVisible = signal(false);
  readonly suspendreDialogVisible = signal(false);

  // Modal remplacer compteur (formulaire délégué à RemplacerCompteurSheetComponent).
  readonly remplacerVisible = signal(false);

  readonly initial = computed(() => {
    const a = this.abonne();
    // L'initiale se prenait sur `nom`, qui vaut « Mr/Mme » pour l'essentiel du
    // fichier abonnés : tous les avatars affichaient « M ». On la prend sur le
    // nom tel qu'il est affiché.
    return a ? (nomAbonne(a.prenom, a.nom)[0] ?? '?').toUpperCase() : '?';
  });

  readonly localisationLine = computed(() => {
    const a = this.abonne();
    const lang = this.translate.currentLang() ?? undefined;
    if (!a) return '';
    const compteurParts = a.compteur
      ? (() => {
          const compteurLabel = this.translate.instant('ABONNES.DETAIL.COMPTEUR', {}, lang);
          const campLabel = this.translate.instant('ABONNES.FORM.CAMP', {}, lang);
          return [
            `${compteurLabel} C-${String(a.compteur.numeroCompteur).padStart(4, '0')}`,
            `${a.compteur.quartier}, ${campLabel} ${a.compteur.camp}`,
          ];
        })()
      : [];
    const parts = [a.numeroAbonne, ...compteurParts, a.telephoneWhatsapp];
    return parts.join(' · ');
  });

  readonly abonneDepuis = computed(() => {
    const a = this.abonne();
    const lang = this.translate.currentLang() ?? 'fr';
    if (!a) return '—';
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return new Date(a.createdAt).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  });

  readonly moisDepuis = computed(() => {
    const a = this.abonne();
    const lang = this.translate.currentLang() ?? undefined;
    if (!a) return '';
    const d = new Date(a.createdAt);
    const now = new Date();
    const m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    const key = m <= 1 ? 'ABONNES.DETAIL.MONTHS_AGO_SINGULAR' : 'ABONNES.DETAIL.MONTHS_AGO_PLURAL';
    return this.translate.instant(key, { count: m }, lang);
  });

  readonly soldeKpiClass = computed(() => {
    const s = this.soldeImpaye();
    if (s === null) return 'abonne-kpi--slate';
    return s === 0 ? 'abonne-kpi--green' : 'abonne-kpi--red';
  });

  readonly soldeFormate = computed(() => {
    const s = this.soldeImpaye();
    if (s === null) return '—';
    return formatFcfa(s);
  });

  /** Titre du topbar : nom+prénom quand chargé, "…" en chargement. */
  readonly topbarTitle = computed(() => {
    const a = this.abonne();
    // Le pipe `nomAbonne` avait été posé sur le gabarit et pas ici : la barre
    // affichait « Mr/Mme Jeoffred » quand la carte, 130 px plus bas, affichait
    // « Jeoffred Mr/Mme ». Même ordre partout — prénom puis nom, comme la
    // gateway le compose dans `Facture.abonneNom`.
    if (a) return nomAbonne(a.prenom, a.nom);
    return this.translate.instant('COMMON.LOADING');
  });

  readonly soldeSub = computed(() => {
    const s = this.soldeImpaye();
    if (s === null) return '';
    const lang = this.translate.currentLang() ?? undefined;
    const key = s === 0 ? 'ABONNES.DETAIL.SOLDE_ZERO' : 'ABONNES.DETAIL.SOLDE_DU';
    return this.translate.instant(key, {}, lang);
  });

  constructor() {
    this.abonneId = this.route.snapshot.paramMap.get('id')!;
    this.abonneQuery = this.abonnesService.watchAbonne(this.abonneId);

    // Deep-link : hydrater activeTab depuis ?tab=info|factures|conso|impayes|compteurs.
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    const idx = this.TAB_KEYS.indexOf(tabParam as (typeof this.TAB_KEYS)[number]);
    if (idx >= 0) {
      this.activeTab.set(idx);
      if (idx === 4) void this.loadHistorique();
    }

    this.abonneQuery.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonne) {
            this.abonne.set(data.abonne as AbonneDetail);
          } else if (!loading) {
            this.error.set(this.translate.instant('ERRORS.LOAD_ABONNE'));
          }
        },
        error: (err: unknown) => {
          const { code, message } = extractGqlError(err);
          if (code === 'NOT_FOUND') {
            this.router.navigateByUrl('/abonnes');
          } else {
            this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNE'));
            this.loading.set(false);
          }
        },
      });

    this.abonneQuery.subscribeToMore<AbonneDetailUpdatedSubscription>({
      document: ABONNE_DETAIL_UPDATED_SUB,
      variables: { id: this.abonneId },
      updateQuery: (_, { subscriptionData }): void | GetAbonneQuery => {
        const updated = subscriptionData.data?.abonneUpdated;
        if (!updated) return;
        return { abonne: updated };
      },
      onError: () => { /* Real-time sync unavailable — detail still works via refetch */ },
    });

    void this.loadFactures();
  }

  private async loadFactures(): Promise<void> {
    this.facturesLoading.set(true);
    try {
      const factures = await this.facturesService.getFactures({ abonneId: this.abonneId });
      this.factures.set(factures);
      await Promise.all([this.calculerSolde(factures), this.chargerAvoir(this.abonneId)]);
    } catch {
      // Non bloquant : la fiche reste utilisable sans l'historique de facturation.
    } finally {
      this.facturesLoading.set(false);
    }
  }

  /**
   * Additionne les soldes restants des factures non soldées. Les erreurs par
   * facture sont avalées : un solde partiel vaut mieux qu'une carte vide, et
   * la fiche reste utilisable sans.
   */
  /**
   * Charge l'avoir de l'abonne.
   *
   * Degradation silencieuse : un avoir indisponible ne doit pas empecher la
   * fiche de s'afficher. Zero est alors le repli honnete — n'annoncer aucun
   * credit est moins grave qu'en annoncer un faux.
   */
  private async chargerAvoir(abonneId: string): Promise<void> {
    const a = await this.facturesService.getAvoirAbonne(abonneId).catch(() => null);
    this.avoir.set(a?.montant ?? 0);
  }

  private async calculerSolde(factures: readonly FactureLigne[]): Promise<void> {
    // Une facture annulee n'est plus une dette : la compter ici ferait
    // reapparaitre dans le solde un montant que personne ne doit plus.
    const impayees = factures.filter((f) => f.statut !== 'PAYEE' && f.statut !== 'ANNULEE');
    if (impayees.length === 0) {
      this.soldeImpaye.set(0);
      return;
    }
    const soldes = await Promise.all(
      impayees.map((f) =>
        this.facturesService.getSoldeFacture(f.factureId).catch(() => null),
      ),
    );
    const connus = soldes.filter((s): s is SoldeDetail => s !== null);
    this.soldesOuverts.set(connus.filter((s) => (s.soldeRestant ?? 0) > 0));
    this.soldeImpaye.set(
      connus.length > 0 ? connus.reduce((a, s) => a + (s.soldeRestant ?? 0), 0) : null,
    );
  }

  /** Utilisé par `consoBars()` (onglet Conso, resté ici) — dupliqué dans
   *  `<app-factures-table>`, seule à en avoir par ailleurs besoin. */
  periodeFacture(f: FactureLigne): string {
    if (!f.dateReleve) return '—';
    const lang = this.translate.currentLang() ?? 'fr';
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return new Date(f.dateReleve).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  }

  // `formatFCFA` (formatage d'un montant de facture) vit désormais dans
  // <app-factures-table>, seule à en avoir besoin. Le `stopPropagation()` de
  // l'ancien `openPdf(factureId, event)` y est passé aussi (`onPdfClick`) —
  // ce composant n'a plus qu'à ouvrir le PDF.
  async openPdf(factureId: string): Promise<void> {
    try {
      await this.facturePdf.open(factureId);
    } catch {
      this.toast.error(this.translate.instant('ABONNES.DETAIL.PDF_ERROR'));
    }
  }

  voirFactures(): void {
    this.setActiveTab(1);
  }

  async loadAbonne(): Promise<void> {
    this.error.set(null);
    try {
      await this.abonneQuery.refetch();
    } catch (err: unknown) {
      const { code, message } = extractGqlError(err);
      if (code === 'NOT_FOUND') {
        this.router.navigateByUrl('/abonnes');
      } else {
        this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNE'));
      }
    }
  }


  // ── Onglets (WAI-ARIA Tabs pattern + deep-link) ──────────────────────────────

  setActiveTab(index: number): void {
    this.activeTab.set(index);
    if (index === 4 && !this.historiqueLoaded()) {
      this.loadHistorique();
    }
    // Sync URL ?tab=... sans re-navigation (URL replace).
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.TAB_KEYS[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Keyboard navigation entre onglets (WAI-ARIA Tabs pattern) :
   * flèches gauche/droite pour cycler, Home/End pour extrêmes.
   * Le focus suit la sélection (automatic activation).
   */
  onTabKeydown(ev: KeyboardEvent, index: number): void {
    const n = this.TAB_KEYS.length;
    let next = index;
    switch (ev.key) {
      case 'ArrowRight': next = (index + 1) % n; break;
      case 'ArrowLeft':  next = (index - 1 + n) % n; break;
      case 'Home':       next = 0; break;
      case 'End':        next = n - 1; break;
      default: return;
    }
    ev.preventDefault();
    this.setActiveTab(next);
    // Focus le tab cible pour que le lecteur d'écran suive.
    queueMicrotask(() => {
      const btn = document.getElementById(`abonneTab-${next}`);
      btn?.focus();
    });
  }

  private async loadHistorique(): Promise<void> {
    this.historiqueLoading.set(true);
    this.historiqueError.set(null);
    try {
      const data = await this.abonnesService.getHistoriqueCompteur(this.abonneId);
      this.historique.set(data);
      this.historiqueLoaded.set(true);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.historiqueError.set(message || this.translate.instant('ERRORS.LOAD_HISTORIQUE'));
    } finally {
      this.historiqueLoading.set(false);
    }
  }


  // ── Navigation formulaire ────────────────────────────────────────────────────

  goToEditForm(): void {
    this.router.navigateByUrl(`/abonnes/${this.abonneId}/modifier`);
  }

  // ── Actions statut ──────────────────────────────────────────────────────────

  /** Ouvre la bottom-sheet de confirmation (v3 : parité avec Résilier/Réactiver). */
  suspendre(): void {
    this.suspendreDialogVisible.set(true);
  }

  /** Applique le statut émis par la sheet de suspension. */
  onSuspended(statut: StatutAbonne): void {
    this.abonne.update((a) => (a ? { ...a, statut } : a));
    this.suspendreDialogVisible.set(false);
    this.toast.warning(this.translate.instant('ABONNES.DETAIL.TOAST_SUSPENDED'));
  }

  reactiver(): void {
    this.reactiverDialogVisible.set(true);
  }

  /** Applique le statut émis par la sheet de réactivation. */
  onReactived(statut: StatutAbonne): void {
    this.abonne.update((a) => (a ? { ...a, statut } : a));
    this.reactiverDialogVisible.set(false);
    this.toast.success(this.translate.instant('ABONNES.DETAIL.TOAST_REACTIVATED'));
  }

  confirmerResiliation(): void {
    this.resilierDialogVisible.set(true);
  }

  /** Applique le statut émis par la sheet de résiliation. */
  onResilied(statut: StatutAbonne): void {
    this.abonne.update((a) => (a ? { ...a, statut } : a));
    this.resilierDialogVisible.set(false);
    this.toast.info(this.translate.instant('ABONNES.DETAIL.TOAST_RESILIE'));
  }

  // ── Modal remplacer compteur ─────────────────────────────────────────────────

  openRemplacerModal(): void {
    this.remplacerVisible.set(true);
  }

  /** Applique le nouveau compteur émis par la bottom-sheet de remplacement. */
  onCompteurRemplace(newCompteur: Compteur): void {
    this.abonne.update((a) => (a ? { ...a, compteur: newCompteur } : a));
    this.remplacerVisible.set(false);
    this.toast.success(this.translate.instant('ABONNES.DETAIL.TOAST_METER_REPLACED'));
  }
}
