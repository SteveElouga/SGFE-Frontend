import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Campagne } from '../../../shared/models/campagne.model';
import { Facture, StatutFacture, factureStatutTone } from '../../../shared/models/facture.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';
import { GET_ABONNES } from '../../../graphql/queries/abonnes.queries';
import { GET_CAMPAGNES } from '../../../graphql/queries/campagnes.queries';
import { PaiementPanelComponent } from './paiement-panel/paiement-panel.component';
import { ToastService } from '../../../shared/services/toast.service';

interface AbonneInfo {
  nom: string;
  prenom: string;
  numeroAbonne: string;
}

interface CampagneOption {
  label: string;
  value: string;
}

@Component({
  imports: [
    FormsModule,
    SelectModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FilterBarComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    BadgeComponent,
    PaiementPanelComponent,
  ],
  templateUrl: './factures-list.component.html',
  styleUrl: './factures-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacturesListComponent implements OnInit {
  /** Exposé au template pour la teinte des puces de statut. */
  protected readonly factureStatutTone = factureStatutTone;

  private readonly facturesService = inject(FacturesService);
  private readonly facturePdf = inject(FacturePdfService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly apollo = inject(Apollo);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly campagneId = signal('');
  readonly campagneNom = signal('');
  readonly campagne = signal<Campagne | null>(null);
  readonly loading = signal(true);
  readonly generatingFactures = signal(false);
  readonly sendingWhatsapp = signal(false);
  readonly error = signal<string | null>(null);
  readonly factures = signal<Facture[]>([]);
  readonly soldes = signal<Map<string, number>>(new Map());
  readonly abonnesMap = signal<Map<string, AbonneInfo>>(new Map());
  readonly allCampagnes = signal<CampagneOption[]>([]);

  readonly filtreStatut = signal<StatutFacture | 'TOUS'>('TOUS');
  readonly searchTerm = signal('');

  readonly columns: DataTableColumn[] = [
    { key: 'numero', header: 'FACTURATION.COL_NUMERO' },
    { key: 'abonne', header: 'FACTURATION.COL_ABONNE' },
    { key: 'montant', header: 'FACTURATION.COL_MONTANT' },
    { key: 'solde', header: 'FACTURATION.COL_SOLDE' },
    { key: 'statut', header: 'FACTURATION.COL_STATUT' },
    { key: 'actions', header: 'FACTURATION.COL_ACTIONS' },
  ];
  /** Seules les factures non soldées sont cliquables (ouvre le panneau de paiement). */
  readonly rowActivable = (f: Facture): boolean => f.statut !== 'PAYEE';
  /** Surligne la facture dont le panneau de paiement est ouvert. */
  readonly rowClassFn = (f: Facture): string | null =>
    this.selectedFacture()?.factureId === f.factureId ? 'dt__row--selected' : null;

  /** Facture dont le panneau de paiement est ouvert (null = fermé). */
  readonly selectedFacture = signal<Facture | null>(null);

  readonly filtreOptions = computed((): Array<{ label: string; value: StatutFacture | 'TOUS' }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('FACTURATION.STATUT.TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('FACTURATION.STATUT.IMPAYEE', {}, lang), value: 'IMPAYEE' },
      { label: this.translate.instant('FACTURATION.STATUT.PARTIELLE', {}, lang), value: 'PARTIELLE' },
      { label: this.translate.instant('FACTURATION.STATUT.PAYEE', {}, lang), value: 'PAYEE' },
    ] as Array<{ label: string; value: StatutFacture | 'TOUS' }>;
  });

  readonly facturesFiltrees = computed(() => {
    let list = this.factures();
    const statut = this.filtreStatut();
    if (statut !== 'TOUS') list = list.filter((f) => f.statut === statut);
    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      const abonnesMap = this.abonnesMap();
      list = list.filter((f) => {
        const abonne = abonnesMap.get(f.abonneId);
        const nomComplet = abonne ? `${abonne.prenom} ${abonne.nom}`.toLowerCase() : '';
        return f.numeroFacture.toLowerCase().includes(term) || nomComplet.includes(term);
      });
    }
    return list;
  });

  readonly subtitle = computed(() => {
    const count = this.factures().length;
    const nom = this.campagneNom();
    const lang = this.translate.currentLang() ?? undefined;
    return nom
      ? this.translate.instant('FACTURATION.SUBTITLE_CAMPAGNE', { nom, count }, lang)
      : this.translate.instant('FACTURATION.SUBTITLE', { count }, lang);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.params['campagneId'] as string | undefined;
    if (id) {
      this.campagneId.set(id);
      void this.load();
    } else {
      void this.redirectToMostRecentCampagne();
    }
  }

  private async redirectToMostRecentCampagne(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.apollo.query<{
          campagnes: Array<{ campagneId: string; statut: string; periodeMois: number; periodeAnnee: number }>;
        }>({
          query: GET_CAMPAGNES,
          fetchPolicy: 'cache-first',
        }),
      );
      const statutPriority = (s: string) =>
        s === 'CLOTUREE' ? 0 : s === 'EN_COURS' ? 1 : 2;
      const sorted = [...(result.data?.campagnes ?? [])].sort((a, b) => {
        const sp = statutPriority(a.statut) - statutPriority(b.statut);
        if (sp !== 0) return sp;
        if (b.periodeAnnee !== a.periodeAnnee) return b.periodeAnnee - a.periodeAnnee;
        return b.periodeMois - a.periodeMois;
      });
      if (sorted.length > 0) {
        void this.router.navigate(['/factures/campagne', sorted[0].campagneId], {
          replaceUrl: true,
        });
      } else {
        this.loading.set(false);
      }
    } catch {
      this.loading.set(false);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [factures] = await Promise.all([
        this.facturesService.getFacturesParCampagne(this.campagneId()),
        this.loadCampagneNom(this.campagneId()),
        this.loadAbonnes(),
        this.loadAllCampagnes(),
      ]);
      this.factures.set(factures);
      const partielles = factures.filter((f) => f.statut === 'PARTIELLE');
      void this.loadSoldes(partielles);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('FACTURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCampagneNom(campagneId: string): Promise<void> {
    try {
      const campagne = await this.campagnesService.getCampagne(campagneId);
      this.campagne.set(campagne);
      this.campagneNom.set(campagne.nom);
    } catch {
      // non-critical
    }
  }

  private async loadAbonnes(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apollo.query<{
          abonnes: Array<{ id: string; nom: string; prenom: string; numeroAbonne: string }>;
        }>({
          query: GET_ABONNES,
          fetchPolicy: 'cache-first',
        }),
      );
      const map = new Map<string, AbonneInfo>();
      for (const a of result.data?.abonnes ?? []) {
        map.set(a.id, { nom: a.nom, prenom: a.prenom, numeroAbonne: a.numeroAbonne });
      }
      this.abonnesMap.set(map);
    } catch {
      // non-critical
    }
  }

  private async loadAllCampagnes(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apollo.query<{
          campagnes: Array<{ campagneId: string; nom: string; statut: string; periodeMois: number; periodeAnnee: number }>;
        }>({
          query: GET_CAMPAGNES,
          fetchPolicy: 'cache-first',
        }),
      );
      const statutPriority = (s: string) =>
        s === 'CLOTUREE' ? 0 : s === 'EN_COURS' ? 1 : 2;
      const sorted = [...(result.data?.campagnes ?? [])].sort((a, b) => {
        const sp = statutPriority(a.statut) - statutPriority(b.statut);
        if (sp !== 0) return sp;
        if (b.periodeAnnee !== a.periodeAnnee) return b.periodeAnnee - a.periodeAnnee;
        return b.periodeMois - a.periodeMois;
      });
      this.allCampagnes.set(sorted.map((c) => ({ label: c.nom, value: c.campagneId })));
    } catch {
      // non-critical
    }
  }

  async genererFactures(): Promise<void> {
    if (this.generatingFactures()) return;
    this.generatingFactures.set(true);
    try {
      const envoyerWA = this.campagne()?.envoyerWhatsappAuto ?? false;
      await this.facturesService.genererFactures(this.campagneId(), envoyerWA);
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_GENERE'));
      await this.load();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.generatingFactures.set(false);
    }
  }

  async envoyerToutesWhatsapp(): Promise<void> {
    if (this.sendingWhatsapp()) return;
    this.sendingWhatsapp.set(true);
    try {
      await this.facturesService.envoyerToutesFacturesWhatsapp(this.campagneId());
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_WHATSAPP_TOUS'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.sendingWhatsapp.set(false);
    }
  }

  private async loadSoldes(factures: Facture[]): Promise<void> {
    if (!factures.length) return;
    const results = await Promise.allSettled(
      factures.map((f) => this.facturesService.getSoldeFacture(f.factureId)),
    );
    const map = new Map(this.soldes());
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map.set(factures[i].factureId, r.value.soldeRestant);
      }
    });
    this.soldes.set(map);
  }

  // Heuristique de solde basée sur le statut, pour éviter N appels backend au
  // chargement de la liste (seules les PARTIELLE sont interrogées). Limite connue :
  // si le statut backend est désynchronisé du solde réel (soldeRestant=0 mais
  // statut IMPAYEE — synchro UpdateStatutFacture dégradée), cette colonne affiche
  // le montant total alors que le vrai solde est 0. Le panneau de paiement et la
  // page détail, eux, se fient au soldeFacture backend (autoritaire).
  // Correctif attendu côté backend : cf. docs/BESOINS_API_facturation.md §1.
  soldeFor(f: Facture): number | null {
    if (f.statut === 'PAYEE') return 0;
    if (f.statut === 'IMPAYEE') return f.montant;
    return this.soldes().get(f.factureId) ?? null;
  }

  abonneFor(abonneId: string): AbonneInfo | null {
    return this.abonnesMap().get(abonneId) ?? null;
  }

  onCampagneChange(campagneId: string): void {
    if (campagneId !== this.campagneId()) {
      void this.router.navigate(['/factures/campagne', campagneId]);
    }
  }

  onStatutChange(statut: StatutFacture | 'TOUS'): void {
    this.filtreStatut.set(statut);
    this.closePanel();
  }

  /** Ouvre le panneau de paiement pour une facture (chargement délégué au composant). */
  openPanel(facture: Facture): void {
    this.selectedFacture.set(facture);
  }

  closePanel(): void {
    this.selectedFacture.set(null);
  }

  /** Le paiement a été enregistré par le panneau → recharge la liste. */
  async onPaiementSaved(): Promise<void> {
    this.toast.success(this.translate.instant('FACTURATION.SUCCESS_PAIEMENT'));
    this.closePanel();
    await this.load();
  }

  async envoyerWhatsapp(factureId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.facturesService.renvoyerFactureWhatsapp(factureId);
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_WHATSAPP'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    }
  }

  viewDetail(factureId: string, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/factures', factureId]);
  }

  async openPdf(factureId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.facturePdf.open(factureId);
    } catch {
      this.toast.error(this.translate.instant('FACTURATION.DETAIL.PDF_ERROR'));
    }
  }

  formatNumber(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString('fr-FR');
  }
}
