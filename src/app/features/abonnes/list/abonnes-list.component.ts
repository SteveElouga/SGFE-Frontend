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

  readonly abonnes = signal<AbonneLigne[]>([]);
  readonly reactiverDialogVisible = signal(false);
  readonly reactiverCible = signal<AbonneLigne | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

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
    const all = this.abonnes();
    const actifs = all.filter((a) => a.statut === 'ACTIF').length;
    const suspendus = all.filter((a) => a.statut === 'SUSPENDU').length;
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
    const all = this.abonnes();
    const chips: Array<{ key: string; value: StatutAbonne }> = [
      { key: 'ABONNES.CHIP_ACTIFS', value: 'ACTIF' },
      { key: 'ABONNES.CHIP_SUSPENDUS', value: 'SUSPENDU' },
      { key: 'ABONNES.CHIP_RESILIES', value: 'RESILIE' },
    ];
    const quartiers = [
      ...new Set(
        this.abonnes()
          .map((a) => a.compteur?.quartier)
          .filter((q): q is string => !!q),
      ),
    ].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    return [
      {
        key: 'statut',
        label: 'ABONNES.STATUT_FILTER',
        options: chips.map((c) => ({
          label: this.translate.instant(c.key, {}, lang),
          value: c.value,
          count: all.filter((a) => a.statut === c.value).length,
        })),
      },
      {
        key: 'quartier',
        label: 'ABONNES.QUARTIER_FILTER',
        options: quartiers.map((q) => ({ label: q, value: q })),
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
    this.abonnesQuery = this.abonnesService.watchAbonnes();

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
    this.reactiverDialogVisible.set(false);
    this.toast.success(
      this.translate.instant('ABONNES.DETAIL.TOAST_REACTIVATED'),
      `${abonne.nom} ${abonne.prenom} est de nouveau actif.`,
    );
  }
}
