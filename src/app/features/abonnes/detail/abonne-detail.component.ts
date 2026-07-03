import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { DatePipe, NgClass } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService, RemplacerCompteurInput } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { Abonne, HistoriqueCompteurEntry } from '../../../shared/models/abonne.model';
import { Facture } from '../../../shared/models/facture.model';
import { ABONNE_DETAIL_UPDATED_SUB } from '../../../graphql/queries/abonnes.queries';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';

@Component({
  imports: [
    FormsModule,
    RouterLink,
    ToastModule,
    DialogModule,
    InputTextModule,
    DatePipe,
    NgClass,
    TranslatePipe,
    CompteurPipe,
    ErrorBannerComponent,
    TooltipDirective,
  ],
  providers: [MessageService],
  templateUrl: './abonne-detail.component.html',
  styleUrl: './abonne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonneDetailComponent {
  private readonly abonnesService = inject(AbonnesService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  private readonly abonneId: string;
  private readonly abonneQuery: QueryRef<{ abonne: Abonne }>;

  readonly abonne = signal<Abonne | null>(null);
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
  readonly factures = signal<Facture[]>([]);
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


  // Modal réactivation
  readonly reactiverDialogVisible = signal(false);

  // Modal résiliation
  readonly resilierDialogVisible = signal(false);
  readonly resilierConfirme = signal(false);

  // Modal remplacer compteur
  readonly remplacerVisible = signal(false);
  readonly newNumeroCompteur = signal('');
  readonly newQuartier = signal('');
  readonly newCamp = signal('');
  readonly newIndexInitial = signal('0');
  readonly newDatePose = signal('');
  readonly remplacerLoading = signal(false);
  readonly remplacerDernierIndex = signal<number | null>(null);
  readonly remplacerDernierIndexLoading = signal(false);

  readonly initial = computed(() => {
    const a = this.abonne();
    return a ? (a.nom[0] ?? '?').toUpperCase() : '?';
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
    const s = this.abonne()?.soldeImpayes;
    if (s === undefined || s === null) return 'abonne-kpi--slate';
    return s === 0 ? 'abonne-kpi--green' : 'abonne-kpi--red';
  });

  readonly soldeFormate = computed(() => {
    const s = this.abonne()?.soldeImpayes;
    if (s === undefined || s === null) return '—';
    return `${s.toLocaleString('fr-FR')} FCFA`;
  });

  readonly soldeSub = computed(() => {
    const s = this.abonne()?.soldeImpayes;
    if (s === undefined || s === null) return '';
    const lang = this.translate.currentLang() ?? undefined;
    const key = s === 0 ? 'ABONNES.DETAIL.SOLDE_ZERO' : 'ABONNES.DETAIL.SOLDE_DU';
    return this.translate.instant(key, {}, lang);
  });

  readonly reactiverTitle = computed(() => {
    const a = this.abonne();
    if (!a) return '';
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('ABONNES.DETAIL.REACTIV_TITLE_NOM', { nom: a.nom, prenom: a.prenom }, lang);
  });

  readonly resilierTitle = computed(() => {
    const a = this.abonne();
    if (!a) return this.translate.instant('ABONNES.DETAIL.RESILIATION_TITLE');
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('ABONNES.DETAIL.RESIL_TITLE_NOM', { nom: a.nom, prenom: a.prenom }, lang);
  });

  readonly compteurNumDisplay = computed(() => {
    const c = this.abonne()?.compteur;
    if (!c) return '—';
    return `C-${String(c.numeroCompteur).padStart(4, '0')}`;
  });

  readonly remplacerDernierIndexDisplay = computed(() => {
    const idx = this.remplacerDernierIndex();
    if (idx === null) return '—';
    return `${idx.toLocaleString('fr-FR')} m³`;
  });

  constructor(route: ActivatedRoute) {
    this.abonneId = route.snapshot.paramMap.get('id')!;
    this.abonneQuery = this.abonnesService.watchAbonne(this.abonneId);

    this.abonneQuery.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonne) {
            this.abonne.set(data.abonne as Abonne);
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

    this.abonneQuery.subscribeToMore<{ abonneUpdated: Abonne }>({
      document: ABONNE_DETAIL_UPDATED_SUB,
      variables: { id: this.abonneId },
      updateQuery: (_, { subscriptionData }): void | { abonne: Abonne } => {
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
    } catch {
      // Non bloquant : la fiche reste utilisable sans l'historique de facturation.
    } finally {
      this.facturesLoading.set(false);
    }
  }

  periodeFacture(f: Facture): string {
    if (!f.dateReleve) return '—';
    const lang = this.translate.currentLang() ?? 'fr';
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return new Date(f.dateReleve).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  }

  formatFCFA(n: number | null | undefined): string {
    return `${(n ?? 0).toLocaleString('fr-FR')} F`;
  }

  pdfUrl(factureId: string): string {
    return `/api/factures/${factureId}/pdf`;
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


  // ── Onglets ──────────────────────────────────────────────────────────────────

  setActiveTab(index: number): void {
    this.activeTab.set(index);
    if (index === 4 && !this.historiqueLoaded()) {
      this.loadHistorique();
    }
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

  async suspendre(): Promise<void> {
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.suspendreAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('ABONNES.DETAIL.TOAST_SUSPENDED') });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.statutLoading.set(false);
    }
  }

  reactiver(): void {
    this.reactiverDialogVisible.set(true);
  }

  async doReactiver(): Promise<void> {
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.reactiverAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.reactiverDialogVisible.set(false);
      this.messageService.add({ severity: 'success', summary: this.translate.instant('ABONNES.DETAIL.TOAST_REACTIVATED') });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.statutLoading.set(false);
    }
  }

  confirmerResiliation(): void {
    this.resilierConfirme.set(false);
    this.resilierDialogVisible.set(true);
  }

  async resilier(): Promise<void> {
    if (!this.resilierConfirme()) return;
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.resilierAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.resilierDialogVisible.set(false);
      this.resilierConfirme.set(false);
      this.messageService.add({ severity: 'info', summary: this.translate.instant('ABONNES.DETAIL.TOAST_RESILIE') });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.statutLoading.set(false);
    }
  }

  // ── Modal remplacer compteur ─────────────────────────────────────────────────

  openRemplacerModal(): void {
    const c = this.abonne()?.compteur;
    this.newNumeroCompteur.set('');
    this.newQuartier.set(c?.quartier ?? '');
    this.newCamp.set(c?.camp ? String(c.camp) : '');
    this.newIndexInitial.set('0');
    this.newDatePose.set(new Date().toISOString().slice(0, 10));
    this.remplacerDernierIndex.set(null);
    this.remplacerVisible.set(true);
    void this.loadDernierIndex();
  }

  private async loadDernierIndex(): Promise<void> {
    this.remplacerDernierIndexLoading.set(true);
    try {
      const result = await this.campagnesService.getDernierIndex(this.abonneId);
      this.remplacerDernierIndex.set(result.dernierIndex);
    } catch {
      // Afficher '—' en cas d'erreur — non bloquant
    } finally {
      this.remplacerDernierIndexLoading.set(false);
    }
  }

  async saveRemplacer(): Promise<void> {
    const n = Number.parseInt(this.newNumeroCompteur(), 10);
    const camp = Number.parseInt(this.newCamp(), 10);
    const indexInitial = Number.parseFloat(this.newIndexInitial());
    if (!n || !camp) return;

    this.remplacerLoading.set(true);
    const input: RemplacerCompteurInput = {
      numeroCompteur: n,
      quartier: this.newQuartier(),
      camp,
      indexInitial: Number.isNaN(indexInitial) ? 0 : indexInitial,
      datePose: this.newDatePose(),
    };
    try {
      const newCompteur = await this.abonnesService.remplacerCompteur(this.abonneId, input);
      this.abonne.update((a) => (a ? { ...a, compteur: newCompteur } : a));
      this.remplacerVisible.set(false);
      this.messageService.add({ severity: 'success', summary: this.translate.instant('ABONNES.DETAIL.TOAST_METER_REPLACED') });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.remplacerLoading.set(false);
    }
  }
}
