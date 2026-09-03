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
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FACTURE_UPDATED_SUB } from '../../../graphql/queries/factures.queries';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Campagne } from '../../../shared/models/campagne.model';
import {
  DetteAbonne,
  Facture,
  StatutFacture,
  factureStatutTone,
} from '../../../shared/models/facture.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import {
  DataTableComponent,
  DataTableColumn,
} from '../../../shared/components/data-table/data-table.component';
import {
  DataTableCardDirective,
  DataTableCellDirective,
} from '../../../shared/components/data-table/data-table.directives';
import { PaiementPanelComponent } from './paiement-panel/paiement-panel.component';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';
import {
  FiltersPanelComponent,
  FilterDefinition,
  FilterValues,
} from '../../../shared/components/filters-panel/filters-panel.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { ToastService } from '../../../shared/services/toast.service';
import { PlurielPipe } from '../../../shared/pipes/pluriel.pipe';
import type { FactureUpdatedSubscription } from '../../../graphql/generated';
import type { CampagneDetail, FactureLigne } from '../../../graphql/vues';

interface AbonneInfo {
  nom: string;
  prenom: string;
  numeroAbonne: string;
}

interface CampagneOption {
  label: string;
  value: string;
}

/** Suffixe de forme d'un libellé compté — même convention que le pipe `pluriel`. */
function forme(n: number): '_ZERO' | '_SINGULAR' | '_PLURAL' {
  return n === 0 ? '_ZERO' : n === 1 ? '_SINGULAR' : '_PLURAL';
}

@Component({
  imports: [
    PlurielPipe,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FiltersPanelComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    BadgeComponent,
    PaiementPanelComponent,
    BottomSheetComponent,
    TooltipDirective,
  ],
  templateUrl: './factures-list.component.html',
  styleUrl: './factures-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacturesListComponent implements OnInit {
  /** Destination d'une ligne : le détail de la facture. */
  protected readonly lienFacture = (f: { factureId: string }) => ['/factures', f.factureId];

  /** Exposé au template pour la teinte des puces de statut. */
  protected readonly factureStatutTone = factureStatutTone;

  private readonly facturesService = inject(FacturesService);
  private readonly facturePdf = inject(FacturePdfService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly apollo = inject(Apollo);
  private readonly destroyRef = inject(DestroyRef);

  readonly campagneId = signal('');
  readonly campagneNom = signal('');
  readonly campagne = signal<CampagneDetail | null>(null);
  readonly loading = signal(true);
  readonly generatingFactures = signal(false);
  readonly sendingWhatsapp = signal(false);
  readonly error = signal<string | null>(null);
  readonly factures = signal<FactureLigne[]>([]);
  readonly soldes = signal<Map<string, number>>(new Map());
  /**
   * Ce que chaque abonné doit au total, toutes factures confondues. Une entrée
   * par abonné — pas par facture : six abonnés endettés donnent six appels, pas
   * vingt-cinq.
   */
  readonly dettes = signal<Map<string, DetteAbonne>>(new Map());
  /**
   * Factures dont le solde n'a pas pu être chargé. Sans ce jeu, un refus de
   * rôle ou un 429 laissait la case sur « — », impossible à distinguer d'un
   * chargement en cours.
   */
  readonly soldesEnErreur = signal<Set<string>>(new Set());
  readonly abonnesMap = signal<Map<string, AbonneInfo>>(new Map());
  readonly allCampagnes = signal<CampagneOption[]>([]);

  readonly filtreStatut = signal<StatutFacture | 'TOUS'>('TOUS');
  readonly searchTerm = signal('');

  /** Taille de page — partagée entre le calcul d'`offset` et `app-data-table`. */
  readonly PAGE_SIZE = 10;
  /** Page courante (0-based) — n'a d'effet que côté serveur, voir `modeServeur`. */
  readonly pageIndex = signal(0);
  /** Total réel côté serveur pour {campagne, statut} (mode serveur uniquement). */
  readonly totalCount = signal(0);
  /**
   * Compteurs par statut sur la campagne entière, indépendants de la page
   * affichée — la gateway ne connaît que `campagneId`/`abonneId`/`statut`
   * comme filtres serveur, pas la recherche texte. Servent aux puces de
   * filtre, à la cible de l'envoi WhatsApp en masse et au sous-titre, qui
   * doivent tous parler de la campagne entière, pas de la page à l'écran.
   */
  readonly countsParStatut = signal<Record<StatutFacture, number>>({ IMPAYEE: 0, PARTIELLE: 0, PAYEE: 0, ANNULEE: 0 });

  /**
   * `true` : pagination serveur réelle (`limit`/`offset` + `facturesCount`),
   * le cas courant. `false` : recherche texte active — la gateway ne
   * l'expose pas comme filtre (`factures(campagneId, abonneId, statut)` sont
   * ses seuls arguments) — et l'écran retombe sur l'ancien comportement :
   * toute la campagne (au statut filtré près) chargée, filtrée et paginée
   * côté client par `app-data-table`.
   */
  readonly modeServeur = computed(() => !this.searchTerm().trim());

  /** Total de factures de la campagne, tous statuts confondus (y compris
   *  ANNULEE — sans chip dédié, mais qui comptait dans l'ancien
   *  `factures().length` non filtré ; le sous-titre n'a pas de raison d'en
   *  perdre le compte). */
  readonly totalCampagne = computed(() => {
    const c = this.countsParStatut();
    return c.IMPAYEE + c.PARTIELLE + c.PAYEE + c.ANNULEE;
  });
  /** Nombre de résultats correspondant aux filtres actifs, plein périmètre
   *  (pas seulement la page à l'écran) — pour le « N sur M » du bandeau. */
  readonly resultCount = computed(() =>
    this.modeServeur() ? this.totalCount() : this.facturesFiltrees().length,
  );
  /**
   * `true` quand la campagne n'a strictement aucune facture (bannière
   * « génération manuelle requise »). Page courante vide comme condition
   * nécessaire, `totalCampagne` (chargé à part, voir `chargerCountsParStatut`)
   * comme confirmation en mode serveur — une page 2 vide ne veut pas dire que
   * la campagne l'est, et une page 0 vide pourrait n'être qu'un compteur pas
   * encore revenu du serveur.
   */
  readonly campagneVide = computed(() => {
    if (this.factures().length > 0) return false;
    return this.modeServeur() ? this.totalCampagne() === 0 : true;
  });

  readonly columns: DataTableColumn[] = [
    {
      key: 'numero',
      header: 'FACTURATION.COL_NUMERO',
      sortable: true,
      sortValue: (r) => (r as Facture).numeroFacture,
    },
    {
      key: 'abonne',
      header: 'FACTURATION.COL_ABONNE',
      sortable: true,
      sortValue: (r) => this.abonneFor((r as Facture).abonneId)?.nom ?? '',
    },
    {
      key: 'montant',
      header: 'FACTURATION.COL_MONTANT',
      sortable: true,
      sortValue: (r) => (r as Facture).montant,
    },
    {
      key: 'solde',
      header: 'FACTURATION.COL_SOLDE',
      sortable: true,
      sortValue: (r) => this.soldeFor(r as FactureLigne) ?? 0,
    },
    {
      key: 'statut',
      header: 'FACTURATION.COL_STATUT',
      sortable: true,
      sortValue: (r) => (r as Facture).statut,
    },
    { key: 'actions', header: 'FACTURATION.COL_ACTIONS' },
  ];
  /** Seules les factures non soldées sont cliquables (ouvre le panneau de paiement). */
  readonly rowActivable = (f: FactureLigne): boolean => f.statut !== 'PAYEE';
  /** Surligne la facture dont le panneau de paiement est ouvert. */
  readonly rowClassFn = (f: FactureLigne): string | null =>
    this.selectedFacture()?.factureId === f.factureId ? 'dt__row--selected' : null;

  /** Facture dont le panneau de paiement est ouvert (null = fermé). */
  readonly selectedFacture = signal<FactureLigne | null>(null);

  /** Confirmation d'envoi WhatsApp en masse (P0 batch 8 list). */
  readonly whatsappConfirmVisible = signal(false);

  /**
   * Nombre de factures cibles de l'envoi en masse sur la campagne entière :
   * IMPAYEE + PARTIELLE (PAYEE = déjà réglée, pas de raison de relancer).
   * Vient de `countsParStatut`, pas de `factures()` — cette dernière ne porte
   * plus qu'une page depuis la pagination serveur, alors que
   * `envoyerToutesFacturesWhatsapp` cible bien la campagne entière.
   */
  readonly facturesAEnvoyer = computed(() => {
    const c = this.countsParStatut();
    return c.IMPAYEE + c.PARTIELLE;
  });

  /**
   * Définition des filtres exposés au `<app-filters-panel>` shared. Statut =
   * auto (chips ≤5 options en mobile, select en desktop). Campagne = select
   * partout (souvent >5 options + sémantique de switch de contexte).
   */
  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const counts = this.countsParStatut();
    return [
      {
        key: 'statut',
        label: 'FACTURATION.FILTER_STATUT',
        options: [
          {
            label: this.translate.instant('FACTURATION.CHIP_IMPAYEES', {}, lang),
            value: 'IMPAYEE',
            count: counts.IMPAYEE,
          },
          {
            label: this.translate.instant('FACTURATION.CHIP_PARTIELLES', {}, lang),
            value: 'PARTIELLE',
            count: counts.PARTIELLE,
          },
          {
            label: this.translate.instant('FACTURATION.CHIP_PAYEES', {}, lang),
            value: 'PAYEE',
            count: counts.PAYEE,
          },
        ],
      },
      {
        key: 'campagne',
        label: 'FACTURATION.FILTER_CAMPAGNE',
        options: this.allCampagnes().map((c) => ({ label: c.label, value: c.value })),
        render: 'select',
        clearable: false, // campagne = contexte, doit toujours avoir une valeur
      },
    ];
  });

  /** État courant des filtres à passer au shared. */
  readonly filterValues = computed<FilterValues>(() => ({
    statut: this.filtreStatut() === 'TOUS' ? null : this.filtreStatut(),
    campagne: this.campagneId() || null,
  }));

  /**
   * Handler unifié : le shared émet un `FilterValues` complet à chaque
   * changement. Traduction : statut null → 'TOUS' interne, campagne différente
   * → navigation (contexte).
   */
  onFiltersChange(v: FilterValues): void {
    const campagne = v['campagne'];
    if (campagne && campagne !== this.campagneId()) {
      void this.router.navigate(['/factures/campagne', campagne]);
      return;
    }
    const statut = (v['statut'] as StatutFacture | null) ?? 'TOUS';
    if (statut !== this.filtreStatut()) this.onStatutChange(statut);
  }

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
    // Total de la campagne entière (`countsParStatut`), pas `factures().length`
    // — cette dernière ne porte plus qu'une page depuis la pagination serveur.
    const count = this.totalCampagne();
    const nom = this.campagneNom();
    const lang = this.translate.currentLang() ?? undefined;
    return nom
      ? // « 1 factures » : ces deux libellés étaient accordés en dur au pluriel.
        // Le suffixe suit le compteur, comme le fait désormais le pipe `pluriel`
        // dans les gabarits.
        this.translate.instant(`FACTURATION.SUBTITLE_CAMPAGNE${forme(count)}`, { nom, count }, lang)
      : this.translate.instant(`FACTURATION.SUBTITLE${forme(count)}`, { count }, lang);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.params['campagneId'] as string | undefined;
    if (id) {
      this.campagneId.set(id);
      void this.load().then(() => this.ecouterFactures());
    } else {
      void this.redirectToMostRecentCampagne();
    }
  }

  /**
   * `factureUpdated` sans argument : le flux global des factures.
   *
   * L'argument `campagneId` existe et filtrerait à la source, mais il faudrait
   * rouvrir le flux à chaque changement de campagne du sélecteur — un abonnement
   * resté ouvert sur l'ancienne campagne serait pire que pas d'abonnement du
   * tout. On écoute donc tout et on ne **fusionne que les lignes déjà
   * affichées** : le filtrage par campagne est alors une conséquence de ce que
   * la liste contient, pas une variable à tenir à jour.
   *
   * Ce que ce flux apporte réellement : un comptable encaisse, la ligne passe
   * d'IMPAYÉE à PAYÉE sur l'écran de son collègue sans rechargement. C'est le
   * seul événement fréquent ici — la génération de factures, elle, arrive à la
   * clôture d'une campagne, moment où l'on navigue de toute façon.
   *
   * Limite connue, côté serveur : `facturation` publie sur `GenererFactures` et
   * `UpdateStatutFacture`, mais **pas** sur l'annulation, la régénération ni la
   * régularisation. Ces trois-là resteront invisibles jusqu'au rechargement.
   */
  private ecouterFactures(): void {
    // La souscription ne porte qu'un sous-ensemble des champs de `Facture`
    // (ni index, ni prix au m³, ni libellés enrichis) : on fusionne sur la
    // ligne existante, on ne la remplace jamais — sinon la colonne Abonné
    // se viderait à chaque encaissement.
    type MajFacture = Pick<
      Facture,
      | 'factureId'
      | 'numeroFacture'
      | 'abonneId'
      | 'campagneId'
      | 'statut'
      | 'consommation'
      | 'montant'
      | 'dateReleve'
      | 'dateLimitePaiement'
    >;

    this.apollo
      .subscribe<FactureUpdatedSubscription>({ query: FACTURE_UPDATED_SUB,
        context: { silentError: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const maj = data?.factureUpdated;
          if (!maj) return;
          let fusionnee: FactureLigne | null = null;
          this.factures.update((liste) =>
            liste.map((f) => {
              if (f.factureId !== maj.factureId) return f;
              fusionnee = { ...f, ...maj };
              return fusionnee;
            }),
          );
          // Le solde d'une facture partielle est chargé à part : si le statut
          // vient de basculer en PARTIELLE, il faut aller le chercher.
          if (fusionnee !== null && maj.statut === 'PARTIELLE') {
            void this.loadSoldes([fusionnee]);
          }
          // Un encaissement change aussi ce que l'abonné doit au total —
          // l'annotation « doit X ailleurs » des autres lignes du même abonné
          // serait périmée sans ça.
          if (fusionnee !== null) {
            void this.loadDettes([fusionnee]);
          }
        },
        error: () => {
          /* temps réel indisponible — la liste garde son dernier chargement */
        },
      });
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
  private campagnesDepuisFactures(factures: FactureLigne[]): CampagneOption[] {
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

  /**
   * Point d'entrée « nouvelle campagne » : remet la page à 0, charge la page
   * 0 des factures (via `chargerPageCourante`), puis tout ce qui ne dépend
   * que de la campagne (nom, objet campagne, sélecteur multi-campagnes,
   * compteurs par statut) — pas de la page affichée.
   */
  async load(): Promise<void> {
    this.error.set(null);
    this.pageIndex.set(0);
    await this.chargerPageCourante();
    // Nom de campagne tiré des factures enrichies (repli) — pas de query
    // `campagne`, refusée au COMPTABLE ; `loadCampagneObjet` la complète en
    // best-effort pour ADMIN juste après.
    const nom = this.factures()[0]?.campagneNom;
    if (nom) this.campagneNom.set(nom);
    void this.loadCampagneObjet(this.campagneId());
    // Sélecteur multi-campagnes dérivé de toutes les factures (ADMIN/COMPTABLE).
    void this.loadAllCampagnes();
    void this.chargerCountsParStatut();
  }

  /**
   * (Re)charge la page courante avec les filtres actuels — appelée au
   * changement de page, de statut ou de recherche, et par `load()` pour la
   * page 0. `factures()` porte donc soit la page voulue (mode serveur), soit
   * toute la campagne au statut filtré près (recherche active, voir
   * `modeServeur`) — jamais plus que ce que l'écran affiche réellement.
   */
  private async chargerPageCourante(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const statut = this.filtreStatut() === 'TOUS' ? undefined : this.filtreStatut();
      const serveur = this.modeServeur();
      const params = serveur
        ? { campagneId: this.campagneId(), statut, limit: this.PAGE_SIZE, offset: this.pageIndex() * this.PAGE_SIZE }
        : { campagneId: this.campagneId(), statut };
      const factures = await this.facturesService.getFactures(params);
      this.factures.set(factures);
      // Noms/numéros d'abonnés reconstruits depuis la page affichée
      // uniquement — les lignes hors page n'ont plus besoin d'être résolues.
      const map = new Map<string, AbonneInfo>();
      for (const f of factures) {
        map.set(f.abonneId, {
          nom: f.abonneNom ?? '',
          prenom: '',
          numeroAbonne: f.abonneNumero ?? '',
        });
      }
      this.abonnesMap.set(map);
      if (serveur) void this.chargerTotalCount();
      // Toutes les factures non soldées de la page, et non plus les seules
      // PARTIELLE. L'heuristique « IMPAYEE ⇒ solde = montant » était fausse
      // dès qu'un avoir était imputé, et le trop-perçu désormais accepté rend
      // les avoirs courants : la supposition se trompait de plus en plus
      // souvent.
      const nonSoldees = factures.filter((f) => f.statut !== 'PAYEE');
      void this.loadSoldes(nonSoldees);
      // Pas `nonSoldees` ici : contrairement au solde (toujours 0 pour une
      // facture payée, donc inutile à charger), la dette « ailleurs » reste
      // à vérifier même pour un abonné dont CETTE facture-ci est soldée —
      // rien n'empêche qu'il en doive une autre, dans une autre campagne,
      // invisible de cet écran. Se limiter aux non-soldées faisait
      // disparaître l'alerte dès que la seule ligne visible d'un abonné
      // passait PAYÉE, silencieusement, alors que sa dette réelle n'avait
      // pas bougé.
      void this.loadDettes(factures);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('FACTURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Total réel de factures pour {campagne, statut} — pilote la pagination
   *  de `app-data-table` en mode serveur. */
  private async chargerTotalCount(): Promise<void> {
    try {
      const statut = this.filtreStatut() === 'TOUS' ? undefined : this.filtreStatut();
      this.totalCount.set(
        await this.facturesService.getFacturesCount({ campagneId: this.campagneId(), statut }),
      );
    } catch {
      // Non-bloquant : la pagination reste sur la dernière valeur connue.
    }
  }

  /** Compteurs par statut sur la campagne entière — voir `countsParStatut`. */
  private async chargerCountsParStatut(): Promise<void> {
    const campagneId = this.campagneId();
    const [impayee, partielle, payee, annulee] = await Promise.allSettled([
      this.facturesService.getFacturesCount({ campagneId, statut: 'IMPAYEE' }),
      this.facturesService.getFacturesCount({ campagneId, statut: 'PARTIELLE' }),
      this.facturesService.getFacturesCount({ campagneId, statut: 'PAYEE' }),
      this.facturesService.getFacturesCount({ campagneId, statut: 'ANNULEE' }),
    ]);
    this.countsParStatut.set({
      IMPAYEE: impayee.status === 'fulfilled' ? impayee.value : 0,
      PARTIELLE: partielle.status === 'fulfilled' ? partielle.value : 0,
      PAYEE: payee.status === 'fulfilled' ? payee.value : 0,
      ANNULEE: annulee.status === 'fulfilled' ? annulee.value : 0,
    });
  }

  /** Câblé sur `(searchChange)` — la recherche change aussi la clé de
   *  re-fetch (elle bascule le mode serveur/client, voir `modeServeur`). */
  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.pageIndex.set(0);
    void this.chargerPageCourante();
  }

  /** Câblé sur `(pageChange)` de `app-data-table`, mode serveur uniquement. */
  onPageChange(page: number): void {
    this.pageIndex.set(page);
    void this.chargerPageCourante();
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

  /** Ouvre la sheet de confirmation avant l'envoi en masse (P0 v4). */
  ouvrirConfirmationWhatsapp(): void {
    if (this.facturesAEnvoyer() === 0 || this.sendingWhatsapp()) return;
    this.whatsappConfirmVisible.set(true);
  }

  fermerConfirmationWhatsapp(): void {
    this.whatsappConfirmVisible.set(false);
  }

  /** Exécute réellement l'envoi après confirmation utilisateur. */
  async confirmerEnvoiWhatsapp(): Promise<void> {
    if (this.sendingWhatsapp()) return;
    this.sendingWhatsapp.set(true);
    try {
      await this.facturesService.envoyerToutesFacturesWhatsapp(this.campagneId());
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_WHATSAPP_TOUS'));
      this.whatsappConfirmVisible.set(false);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.sendingWhatsapp.set(false);
    }
  }

  private async loadSoldes(factures: FactureLigne[]): Promise<void> {
    if (!factures.length) return;
    // `async` sur le callback : une erreur levée de façon synchrone devient une
    // promesse rejetée, que `allSettled` absorbe. Sans lui, elle échapperait à
    // l'appelant, qui lance en `void` — donc en rejet non traité.
    const results = await Promise.allSettled(
      factures.map(async (f) => this.facturesService.getSoldeFacture(f.factureId)),
    );
    const map = new Map(this.soldes());
    const enErreur = new Set(this.soldesEnErreur());
    results.forEach((r, i) => {
      const id = factures[i].factureId;
      if (r.status === 'fulfilled') {
        map.set(id, r.value.soldeRestant);
        enErreur.delete(id);
      } else {
        // Un échec ne doit pas se déguiser en chargement : `soldeFacture` est
        // réservée à ADMIN/COMPTABLE, et nginx renvoie 429 au-delà de sa
        // rafale. Dans les deux cas la case restait sur « — », muette.
        enErreur.add(id);
      }
    });
    this.soldes.set(map);
    this.soldesEnErreur.set(enErreur);
  }

  /**
   * Charge la dette totale des abonnés concernés — un appel par abonné
   * distinct. Sert à répondre, sur chaque ligne, à la question que le solde
   * seul ne traite pas : « est-ce que c'est tout ce qu'il me doit ? »
   */
  private async loadDettes(factures: FactureLigne[]): Promise<void> {
    const abonneIds = [...new Set(factures.map((f) => f.abonneId).filter(Boolean))];
    if (!abonneIds.length) return;
    const results = await Promise.allSettled(
      abonneIds.map(async (id) => this.facturesService.getDetteAbonne(id)),
    );
    const map = new Map(this.dettes());
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') map.set(abonneIds[i], r.value);
    });
    this.dettes.set(map);
  }

  // Solde autoritaire : la valeur vient du backend pour toute facture non
  // soldée. L'ancienne heuristique — « IMPAYEE ⇒ solde = montant » — évitait N
  // appels au chargement, au prix d'un chiffre supposé. Elle se trompait dans
  // deux cas : un statut désynchronisé du solde réel, et surtout un avoir
  // imputé, qui réduit le solde sans changer le montant.
  //
  // Le second cas était marginal ; il ne l'est plus. Depuis que le trop-perçu
  // est accepté à la saisie, les avoirs deviennent courants — la supposition
  // se serait donc trompée de plus en plus souvent, et sur les factures les
  // plus délicates à expliquer au guichet.
  soldeFor(f: FactureLigne): number | null {
    if (f.statut === 'PAYEE') return 0;
    // Plus de repli sur `f.montant` pour les IMPAYEE : c'était une supposition,
    // fausse dès qu'un avoir avait réduit le solde. On rend `null` — la colonne
    // affiche « — » le temps du chargement — plutôt qu'un chiffre inventé.
    return this.soldes().get(f.factureId) ?? null;
  }

  /** Le solde de cette facture n'a pas pu être chargé (rôle, réseau, 429). */
  soldeEnErreur(f: FactureLigne): boolean {
    return this.soldesEnErreur().has(f.factureId);
  }

  /**
   * Ce que l'abonné doit **en plus** de cette facture. La colonne solde ne
   * parle que de la ligne qu'on lit ; ce nombre dit si elle raconte toute
   * l'histoire.
   *
   * `null` quand il n'y a rien à signaler : dette non chargée, solde inconnu,
   * ou facture unique. Une annotation qui apparaîtrait partout ne serait plus
   * une annotation.
   */
  autresDettesFor(f: FactureLigne): number | null {
    const dette = this.dettes().get(f.abonneId);
    const solde = this.soldeFor(f);
    if (!dette || solde === null) return null;
    const autres = Math.round(dette.totalDu - solde);
    return autres > 0 ? autres : null;
  }

  /** Nombre de factures que l'abonné doit en plus de celle-ci. */
  autresFacturesFor(f: FactureLigne): number {
    const dette = this.dettes().get(f.abonneId);
    if (!dette) return 0;
    return Math.max(0, dette.nbFactures - (f.statut === 'PAYEE' ? 0 : 1));
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
    this.pageIndex.set(0);
    void this.chargerPageCourante();
  }

  /** Ouvre le panneau de paiement pour une facture (chargement délégué au composant). */
  openPanel(facture: FactureLigne): void {
    this.selectedFacture.set(facture);
  }

  closePanel(): void {
    this.selectedFacture.set(null);
  }

  /**
   * Le paiement a été enregistré par le panneau. Comportement (P2 batch 8) :
   * - Facture désormais PAYEE → close panel (rien de plus à faire).
   * - Facture encore PARTIELLE → re-set `selectedFacture` avec l'objet
   *   fraîchement chargé (nouvelle référence) → l'effect du panel réagit et
   *   recharge son solde, permettant d'enregistrer un autre paiement sans
   *   avoir à re-cliquer sur la ligne.
   */
  async onPaiementSaved(): Promise<void> {
    this.toast.success(this.translate.instant('FACTURATION.SUCCESS_PAIEMENT'));
    const currentId = this.selectedFacture()?.factureId;
    // Recharge la page courante, pas `load()` : un versement ne doit pas
    // renvoyer le comptable en page 1 pendant qu'il encaisse une campagne
    // de plusieurs pages. Les compteurs, eux, ont changé (un statut a bougé).
    await this.chargerPageCourante();
    void this.chargerCountsParStatut();
    if (!currentId) return;
    const updated = this.factures().find((f) => f.factureId === currentId);
    if (!updated || updated.statut === 'PAYEE') {
      this.closePanel();
    } else {
      this.selectedFacture.set(updated);
    }
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
