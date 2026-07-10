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
      // Le COMPTABLE n'a pas accès à la query `campagnes` : on dérive la liste
      // des campagnes des factures (enrichies du nom/période de campagne) et on
      // redirige vers la plus récente qui possède des factures.
      const campagnes = this.campagnesDepuisFactures(await this.facturesService.getFactures());
      if (campagnes.length > 0) {
        void this.router.navigate(['/factures/campagne', campagnes[0].value], { replaceUrl: true });
      } else {
        this.loading.set(false);
      }
    } catch {
      this.loading.set(false);
    }
  }

  /** Campagnes distinctes portées par un lot de factures enrichies, triées de la
   *  plus récente à la plus ancienne (le COMPTABLE n'a pas accès à `campagnes`). */
  private campagnesDepuisFactures(factures: Facture[]): CampagneOption[] {
    const map = new Map<string, { nom: string; mois: number; annee: number }>();
    for (const f of factures) {
      if (f.campagneId && !map.has(f.campagneId)) {
        map.set(f.campagneId, {
          nom: f.campagneNom ?? '',
          mois: f.campagnePeriodeMois ?? 0,
          annee: f.campagnePeriodeAnnee ?? 0,
        });
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].annee - a[1].annee || b[1].mois - a[1].mois)
      .map(([value, v]) => ({ label: v.nom, value }));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const factures = await this.facturesService.getFacturesParCampagne(this.campagneId());
      this.factures.set(factures);
      // Nom de campagne et noms/numéros d'abonnés tirés des factures enrichies
      // — pas de query `campagne`/`abonnes`, refusées au COMPTABLE.
      this.campagneNom.set(factures[0]?.campagneNom ?? '');
      const map = new Map<string, AbonneInfo>();
      for (const f of factures) {
        map.set(f.abonneId, { nom: f.abonneNom ?? '', prenom: '', numeroAbonne: f.abonneNumero ?? '' });
      }
      this.abonnesMap.set(map);
      // Best-effort (ADMIN) : objet campagne complet pour le toggle WhatsApp auto.
      void this.loadCampagneObjet(this.campagneId());
      // Sélecteur multi-campagnes dérivé de toutes les factures.
      void this.loadAllCampagnes();
      const partielles = factures.filter((f) => f.statut === 'PARTIELLE');
      void this.loadSoldes(partielles);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('FACTURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCampagneObjet(campagneId: string): Promise<void> {
    try {
      const campagne = await this.campagnesService.getCampagne(campagneId);
      this.campagne.set(campagne);
      if (!this.campagneNom()) this.campagneNom.set(campagne.nom);
    } catch {
      // non-critique : query `campagne` refusée au COMPTABLE — le nom vient déjà des factures.
    }
  }

  private async loadAllCampagnes(): Promise<void> {
    try {
      this.allCampagnes.set(this.campagnesDepuisFactures(await this.facturesService.getFactures()));
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
