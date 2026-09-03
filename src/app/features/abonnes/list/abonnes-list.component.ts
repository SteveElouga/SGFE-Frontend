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
import { Router, RouterLink } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { Abonne, StatutAbonne } from '../../../shared/models/abonne.model';
import { ABONNE_UPDATED_SUB } from '../../../graphql/queries/abonnes.queries';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { NomAbonnePipe } from '../../../shared/pipes/nom-abonne.pipe';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../../shared/components/filters-panel/filters-panel.component';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';
import { ToastService } from '../../../shared/services/toast.service';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';
import { ReactiverSheetComponent } from '../detail/reactiver-sheet/reactiver-sheet.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import type { AbonneLigne } from '../../../graphql/vues';
import type { AbonneUpdatedSubscription, GetAbonnesQuery } from '../../../graphql/generated';

@Component({
  selector: 'app-abonnes-list',
  imports: [
    RouterLink,
    ErrorBannerComponent,
    StatusBadgeComponent,
    PageTopbarComponent,
    FiltersPanelComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    CompteurPipe,
    NomAbonnePipe,
    TranslatePipe,
    ReactiverSheetComponent,
    TooltipDirective,
  ],
  templateUrl: './abonnes-list.component.html',
  styleUrl: './abonnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonnesListComponent implements OnInit {
  /** Destination d'une ligne : la fiche de l'abonné. */
  protected readonly lienAbonne = (a: { id: string }) => ['/abonnes', a.id];

  private readonly abonnesService = inject(AbonnesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  private abonnesQuery!: QueryRef<GetAbonnesQuery>;

  /** Taille de page — partagée entre le calcul d'`offset` et `app-data-table`. */
  readonly PAGE_SIZE = 25;

  readonly abonnes = signal<AbonneLigne[]>([]);
  readonly reactiverDialogVisible = signal(false);
  readonly reactiverCible = signal<AbonneLigne | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

  /** Page courante (0-based) — n'a d'effet que côté serveur, voir `modeServeur`. */
  readonly pageIndex = signal(0);
  /** Total réel côté serveur pour le statut filtré (mode serveur uniquement). */
  readonly totalCount = signal(0);
  /**
   * Compteurs globaux par statut, indépendants de la page affichée — la
   * gateway ne connaît que `statut` comme filtre serveur ; ni la recherche
   * texte ni le quartier n'existent côté contrat GraphQL. Servent au résumé
   * d'en-tête et aux puces de filtre, qui doivent parler du parc entier, pas
   * de la page à l'écran.
   */
  readonly countsParStatut = signal<Record<StatutAbonne, number>>({ ACTIF: 0, SUSPENDU: 0, RESILIE: 0 });
  /**
   * Quartiers disponibles pour le filtre — dérivés de `abonnesActifs` (léger,
   * déjà utilisé ailleurs) plutôt que de la page affichée : sinon, en mode
   * serveur, le menu ne proposerait que les quartiers de la page 1.
   * Connu défaut : ne couvre que les abonnés ACTIF (les SUSPENDU/RESILIE d'un
   * quartier autrement absent de la page 1 n'y apparaîtraient pas).
   */
  readonly quartiersDisponibles = signal<string[]>([]);

  /**
   * `true` : pagination serveur réelle (`limit`/`offset` + `abonnesCount`),
   * le cas courant. `false` : recherche texte ou quartier actifs — deux
   * filtres que la gateway n'expose pas (`abonnes(statut)` est son seul
   * argument de filtrage) — et l'écran retombe sur l'ancien comportement :
   * tout le statut chargé, filtré et paginé côté client par `app-data-table`.
   * Un compromis assumé, pas une approximation : les deux filtres restent
   * exacts sur l'ensemble du parc, seule la pagination serveur s'efface le
   * temps qu'ils sont actifs.
   */
  readonly modeServeur = computed(() => !this.searchTerm().trim() && !this.quartierFilter());

  /** Total du parc, tous statuts confondus — pour le « … sur N » du bandeau. */
  readonly totalParc = computed(() => {
    const c = this.countsParStatut();
    return c.ACTIF + c.SUSPENDU + c.RESILIE;
  });
  /** Nombre de résultats correspondant aux filtres actifs, plein périmètre
   *  (pas seulement la page à l'écran) — pour le « N sur M » du bandeau. */
  readonly resultCount = computed(() =>
    this.modeServeur() ? this.totalCount() : this.filteredAbonnes().length,
  );

  readonly columns: DataTableColumn[] = [
    { key: 'numero', header: 'ABONNES.NUMERO', sortable: true, sortValue: (r) => (r as Abonne).numeroAbonne },
    { key: 'nom', header: 'ABONNES.NOM_PRENOM', sortable: true, sortValue: (r) => `${(r as Abonne).nom} ${(r as Abonne).prenom}` },
    { key: 'localisation', header: 'ABONNES.QUARTIER_CAMP', sortable: true, sortValue: (r) => (r as Abonne).compteur?.quartier ?? '' },
    { key: 'compteur', header: 'ABONNES.NUMERO_COMPTEUR', sortable: true, sortValue: (r) => (r as Abonne).compteur?.numeroCompteur ?? 0 },
    { key: 'statut', header: 'COMMON.STATUS', sortable: true, sortValue: (r) => (r as Abonne).statut },
    { key: 'actions', header: 'COMMON.ACTIONS' },
  ];

  /** Clé i18n du message vide selon qu'un filtre est actif ou non. */
  readonly emptyKey = computed(() =>
    this.searchTerm() || this.statutFilter() || this.quartierFilter()
      ? 'ABONNES.NO_RESULT_FILTERS'
      : 'ABONNES.NO_RESULT',
  );

  readonly filteredAbonnes = computed(() => {
    let list = this.abonnes();
    const term = this.searchTerm().toLowerCase().trim();
    const statut = this.statutFilter();
    const quartier = this.quartierFilter();

    if (statut) list = list.filter((a) => a.statut === statut);
    if (quartier) list = list.filter((a) => a.compteur?.quartier === quartier);
    if (term) {
      list = list.filter(
        (a) =>
          `${a.nom} ${a.prenom}`.toLowerCase().includes(term) ||
          a.numeroAbonne.toLowerCase().includes(term),
      );
    }
    return list;
  });

  readonly statutSummary = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const counts = this.countsParStatut();
    const actifs = counts.ACTIF;
    const suspendus = counts.SUSPENDU;
    const parts: string[] = [];
    if (actifs > 0) {
      parts.push(this.translate.instant(
        actifs > 1 ? 'ABONNES.SUMMARY_ACTIF_PLURAL' : 'ABONNES.SUMMARY_ACTIF_SINGULAR',
        { count: actifs }, lang,
      ));
    }
    if (suspendus > 0) {
      parts.push(this.translate.instant(
        suspendus > 1 ? 'ABONNES.SUMMARY_SUSPENDU_PLURAL' : 'ABONNES.SUMMARY_SUSPENDU_SINGULAR',
        { count: suspendus }, lang,
      ));
    }
    return parts.join(' · ');
  });

  /** Filtres unifiés (batch 10) : statut auto-chips + quartier select. */
  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const counts = this.countsParStatut();
    const chips: Array<{ key: string; value: StatutAbonne }> = [
      { key: 'ABONNES.CHIP_ACTIFS', value: 'ACTIF' },
      { key: 'ABONNES.CHIP_SUSPENDUS', value: 'SUSPENDU' },
      { key: 'ABONNES.CHIP_RESILIES', value: 'RESILIE' },
    ];
    return [
      {
        key: 'statut',
        label: 'ABONNES.STATUT_FILTER',
        options: chips.map((c) => ({
          label: this.translate.instant(c.key, {}, lang),
          value: c.value,
          count: counts[c.value],
        })),
      },
      {
        key: 'quartier',
        label: 'ABONNES.QUARTIER_FILTER',
        options: this.quartiersDisponibles().map((q) => ({ label: q, value: q })),
        render: 'select',
      },
    ];
  });

  readonly filterValues = computed<FilterValues>(() => ({
    statut: this.statutFilter(),
    quartier: this.quartierFilter(),
  }));

  onFiltersChange(v: FilterValues): void {
    this.statutFilter.set((v['statut'] as StatutAbonne | null) ?? null);
    this.quartierFilter.set(v['quartier']);
    this.pageIndex.set(0);
    this.appliquerFiltres();
  }

  /** Câblé sur `(searchChange)` — la recherche change aussi la clé de re-fetch
   *  (elle bascule le mode serveur/client, voir `modeServeur`). */
  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.pageIndex.set(0);
    this.appliquerFiltres();
  }

  /** Câblé sur `(pageChange)` de `app-data-table`, mode serveur uniquement. */
  onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.appliquerFiltres();
  }

  /** Variables de la requête `abonnes` pour l'état courant des filtres. */
  private variablesCourantes(): { statut?: StatutAbonne; limit?: number; offset?: number } {
    const statut = this.statutFilter() ?? undefined;
    if (!this.modeServeur()) return { statut };
    return { statut, limit: this.PAGE_SIZE, offset: this.pageIndex() * this.PAGE_SIZE };
  }

  /** Repropage les variables courantes sur la requête déjà ouverte, et
   *  recharge le total serveur quand la pagination serveur est active. */
  private appliquerFiltres(): void {
    if (!this.abonnesQuery) return;
    this.loading.set(true);
    void this.abonnesQuery.setVariables(this.variablesCourantes());
    if (this.modeServeur()) void this.chargerTotalCount();
  }

  private async chargerTotalCount(): Promise<void> {
    try {
      this.totalCount.set(await this.abonnesService.getAbonnesCount(this.statutFilter() ?? undefined));
    } catch {
      // Non-bloquant : la pagination reste sur la dernière valeur connue.
    }
  }

  private async chargerCountsGlobaux(): Promise<void> {
    const [actif, suspendu, resilie] = await Promise.allSettled([
      this.abonnesService.getAbonnesCount('ACTIF'),
      this.abonnesService.getAbonnesCount('SUSPENDU'),
      this.abonnesService.getAbonnesCount('RESILIE'),
    ]);
    this.countsParStatut.set({
      ACTIF: actif.status === 'fulfilled' ? actif.value : 0,
      SUSPENDU: suspendu.status === 'fulfilled' ? suspendu.value : 0,
      RESILIE: resilie.status === 'fulfilled' ? resilie.value : 0,
    });
  }

  /** Quartiers pour le filtre — voir la note sur `quartiersDisponibles`. */
  private async chargerQuartiers(): Promise<void> {
    try {
      const actifs = await this.abonnesService.getAbonnesActifs();
      const quartiers = [...new Set(actifs.map((a) => a.quartier).filter((q): q is string => !!q))]
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
      this.quartiersDisponibles.set(quartiers);
    } catch {
      // Non-bloquant : le filtre quartier reste vide plutôt que de casser l'écran.
    }
  }

  /**
   * Variante de dégradé de l'avatar (M-05) : ambre pour un suspendu, gris pour
   * un résilié, sinon un dégradé stable dérivé du n° d'abonné.
   */
  avatarVariant(abonne: AbonneLigne): string {
    if (abonne.statut === 'SUSPENDU') return 'suspendu';
    if (abonne.statut === 'RESILIE') return 'resilie';
    const seed = [...(abonne.numeroAbonne ?? abonne.nom)].reduce((sum, ch) => sum + (ch.codePointAt(0) ?? 0), 0);
    return `g${seed % 4}`;
  }

  ngOnInit(): void {
    this.abonnesQuery = this.abonnesService.watchAbonnes(this.variablesCourantes());
    if (this.modeServeur()) void this.chargerTotalCount();
    void this.chargerCountsGlobaux();
    void this.chargerQuartiers();

    this.abonnesQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonnes) {
            // Apollo déclare `data` comme complet OU partiel : un cache
            // incomplet peut alimenter la vue quand `returnPartialData` est
            // demandé. Cette requête ne le demande pas — la conversion énonce
            // l'invariant que la configuration garantit, et elle reste étroite
            // exprès : c'est le seul endroit où elle vaut.
            this.abonnes.set(data.abonnes as AbonneLigne[]);
          } else if (!loading) {
            this.error.set(this.translate.instant('ERRORS.LOAD_ABONNES'));
          }
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNES'));
          this.loading.set(false);
        },
      });

    this.abonnesQuery.subscribeToMore<AbonneUpdatedSubscription>({
      document: ABONNE_UPDATED_SUB,
      updateQuery: (prev, { subscriptionData }): void | GetAbonnesQuery => {
        const updated = subscriptionData.data?.abonneUpdated;
        if (!updated) return;
        return {
          abonnes: (prev.abonnes ?? []).map((a) =>
            a?.id === updated.id ? updated : (a as Abonne),
          ),
        } as GetAbonnesQuery;
      },
      onError: () => { /* Real-time sync unavailable — list still works via refetch */ },
    });
  }

  async loadAbonnes(): Promise<void> {
    this.error.set(null);
    try {
      await this.abonnesQuery.refetch();
      if (this.modeServeur()) await this.chargerTotalCount();
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.error.set(message || 'Impossible de charger la liste des abonnés.');
    }
  }

  modifierAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}/modifier`);
  }

  confirmReactiver(abonne: AbonneLigne): void {
    this.reactiverCible.set(abonne);
    this.reactiverDialogVisible.set(true);
  }

  /**
   * Callback appelé par <app-reactiver-sheet> quand l'abonné vient d'être
   * réactivé côté service. Met à jour la ligne localement + ferme la sheet +
   * toast. Remplace l'ancien `doReactiver()` qui portait la mutation Apollo
   * inline (dupliquée avec ReactiverSheetComponent, cause du P0 v1).
   */
  onReactivated(newStatut: StatutAbonne): void {
    const abonne = this.reactiverCible();
    if (!abonne) return;
    this.abonnes.update((list) =>
      list.map((a) => (a.id === abonne.id ? { ...a, statut: newStatut } : a)),
    );
    // Un SUSPENDU devient ACTIF : les compteurs globaux (résumé, puces) sont
    // désormais faux tant qu'on ne les recharge pas — ils ne dérivent plus de
    // la page affichée.
    void this.chargerCountsGlobaux();
    this.reactiverDialogVisible.set(false);
    this.toast.success(
      this.translate.instant('ABONNES.DETAIL.TOAST_REACTIVATED'),
      `${abonne.nom} ${abonne.prenom} est de nouveau actif.`,
    );
  }
}
