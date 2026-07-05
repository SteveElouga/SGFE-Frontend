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
import { Router, RouterLink } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { Abonne, StatutAbonne } from '../../../shared/models/abonne.model';
import { ABONNE_UPDATED_SUB } from '../../../graphql/queries/abonnes.queries';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';
import { ToastService } from '../../../shared/services/toast.service';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';

@Component({
  selector: 'app-abonnes-list',
  imports: [
    FormsModule,
    RouterLink,
    SelectModule,
    DialogModule,
    ErrorBannerComponent,
    StatusBadgeComponent,
    PageTopbarComponent,
    FilterBarComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    CompteurPipe,
    TranslatePipe,
  ],
  templateUrl: './abonnes-list.component.html',
  styleUrl: './abonnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonnesListComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  private abonnesQuery!: QueryRef<{ abonnes: Abonne[] }>;

  readonly abonnes = signal<Abonne[]>([]);
  readonly reactiverDialogVisible = signal(false);
  readonly reactiverCible = signal<Abonne | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

  readonly columns: DataTableColumn[] = [
    { key: 'numero', header: 'ABONNES.NUMERO' },
    { key: 'nom', header: 'ABONNES.NOM_PRENOM' },
    { key: 'localisation', header: 'ABONNES.QUARTIER_CAMP' },
    { key: 'compteur', header: 'ABONNES.NUMERO_COMPTEUR' },
    { key: 'statut', header: 'COMMON.STATUS' },
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

  readonly quartiersOptions = computed(() =>
    [
      ...new Set(
        this.abonnes()
          .map((a) => a.compteur?.quartier)
          .filter((q): q is string => !!q),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      .map((q) => ({ label: q, value: q })),
  );

  readonly statutOptions = computed((): Array<{ label: string; value: StatutAbonne }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('STATUS.ACTIF', {}, lang), value: 'ACTIF' },
      { label: this.translate.instant('STATUS.SUSPENDU', {}, lang), value: 'SUSPENDU' },
      { label: this.translate.instant('STATUS.RESILIE', {}, lang), value: 'RESILIE' },
    ];
  });

  ngOnInit(): void {
    this.abonnesQuery = this.abonnesService.watchAbonnes();

    this.abonnesQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonnes) {
            this.abonnes.set(data.abonnes as Abonne[]);
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

    this.abonnesQuery.subscribeToMore<{ abonneUpdated: Abonne }>({
      document: ABONNE_UPDATED_SUB,
      updateQuery: (prev, { subscriptionData }): void | { abonnes: Abonne[] } => {
        const updated = subscriptionData.data?.abonneUpdated;
        if (!updated) return;
        return {
          abonnes: (prev.abonnes ?? []).map((a) =>
            a?.id === updated.id ? updated : (a as Abonne),
          ),
        } as { abonnes: Abonne[] };
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

  voirAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}`);
  }

  modifierAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}/modifier`);
  }

  confirmReactiver(abonne: Abonne): void {
    this.reactiverCible.set(abonne);
    this.reactiverDialogVisible.set(true);
  }

  readonly reactiverLoading = signal(false);

  async doReactiver(): Promise<void> {
    const abonne = this.reactiverCible();
    if (!abonne) return;
    this.reactiverLoading.set(true);
    try {
      const updated = await this.abonnesService.reactiverAbonne(abonne.id);
      this.abonnes.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      this.reactiverDialogVisible.set(false);
      this.toast.success(this.translate.instant('ABONNES.DETAIL.TOAST_REACTIVATED'), `${abonne.nom} ${abonne.prenom} est de nouveau actif.`);
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(this.translate.instant('ERRORS.GENERIC'), message || 'Impossible de réactiver cet abonné.');
    } finally {
      this.reactiverLoading.set(false);
    }
  }
}
