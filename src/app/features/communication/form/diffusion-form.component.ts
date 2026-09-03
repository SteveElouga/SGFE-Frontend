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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CommunicationService } from '../../../core/communication/communication.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { StatutAbonne } from '../../../shared/models/abonne.model';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../../shared/components/filters-panel/filters-panel.component';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';
import { ToastService } from '../../../shared/services/toast.service';
import type { AbonneLigne } from '../../../graphql/vues';

@Component({
  selector: 'app-diffusion-form',
  imports: [
    FormsModule,
    PageTopbarComponent,
    FiltersPanelComponent,
    DataTableComponent,
    DataTableCellDirective,
    TranslatePipe,
  ],
  templateUrl: './diffusion-form.component.html',
  styleUrl: './diffusion-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffusionFormComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly communicationService = inject(CommunicationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly abonnes = signal<AbonneLigne[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly message = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);
  readonly campFilter = signal<number | null>(null);

  /** Sélection manuelle, indépendante des filtres : changer de quartier ne
   * désélectionne pas un abonné déjà coché sous un autre quartier. */
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly columns: DataTableColumn[] = [
    { key: 'numero', header: 'ABONNES.NUMERO' },
    { key: 'nom', header: 'ABONNES.NOM_PRENOM' },
    { key: 'localisation', header: 'ABONNES.QUARTIER_CAMP' },
    { key: 'statut', header: 'COMMON.STATUS' },
  ];

  readonly filteredAbonnes = computed(() => {
    let list = this.abonnes();
    const statut = this.statutFilter();
    const quartier = this.quartierFilter();
    const camp = this.campFilter();
    if (statut) list = list.filter((a) => a.statut === statut);
    if (quartier) list = list.filter((a) => a.compteur?.quartier === quartier);
    if (camp != null) list = list.filter((a) => a.compteur?.camp === camp);
    return list;
  });

  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const all = this.abonnes();
    const quartierChoisi = this.quartierFilter();

    const chips: Array<{ key: string; value: StatutAbonne }> = [
      { key: 'ABONNES.CHIP_ACTIFS', value: 'ACTIF' },
      { key: 'ABONNES.CHIP_SUSPENDUS', value: 'SUSPENDU' },
      { key: 'ABONNES.CHIP_RESILIES', value: 'RESILIE' },
    ];
    const quartiers = [
      ...new Set(all.map((a) => a.compteur?.quartier).filter((q): q is string => !!q)),
    ].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    const defs: FilterDefinition[] = [
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

    // Le camp n'a de sens qu'une fois un quartier choisi — plusieurs quartiers
    // peuvent porter un « Camp 1 », le mélanger serait trompeur.
    if (quartierChoisi) {
      const camps = [
        ...new Set(
          all
            .filter((a) => a.compteur?.quartier === quartierChoisi)
            .map((a) => a.compteur?.camp)
            .filter((c): c is number => c != null),
        ),
      ].sort((a, b) => a - b);
      defs.push({
        key: 'camp',
        label: 'ABONNES.CAMP_FILTER',
        options: camps.map((c) => ({ label: String(c), value: String(c) })),
        render: 'select',
      });
    }

    return defs;
  });

  readonly filterValues = computed<FilterValues>(() => ({
    statut: this.statutFilter(),
    quartier: this.quartierFilter(),
    camp: this.campFilter() != null ? String(this.campFilter()) : null,
  }));

  onFiltersChange(v: FilterValues): void {
    this.statutFilter.set((v['statut'] as StatutAbonne | null) ?? null);
    const nouveauQuartier = v['quartier'];
    if (nouveauQuartier !== this.quartierFilter()) {
      // Un camp n'a de sens que sous le quartier où il a été choisi.
      this.campFilter.set(null);
    } else {
      const camp = v['camp'];
      this.campFilter.set(camp ? Number(camp) : null);
    }
    this.quartierFilter.set(nouveauQuartier);
  }

  readonly nbSelectionnes = computed(() => this.selectedIds().size);
  readonly peutEnvoyer = computed(
    () => this.message().trim().length > 0 && this.nbSelectionnes() > 0 && !this.submitting(),
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.abonnesService
      .watchAbonnes()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonnes) this.abonnes.set(data.abonnes as AbonneLigne[]);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNES'));
          this.loading.set(false);
        },
      });
  }

  async envoyer(): Promise<void> {
    if (!this.peutEnvoyer()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const diffusion = await this.communicationService.creerDiffusion(
        this.message().trim(),
        [...this.selectedIds()],
      );
      this.toast.success(
        this.translate.instant('COMMUNICATION.TOAST_LANCEE_TITRE'),
        this.translate.instant('COMMUNICATION.TOAST_LANCEE_DESC', { count: diffusion.nbTotal }),
      );
      this.router.navigate(['/communication', diffusion.diffusionId]);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('COMMUNICATION.ERREUR_ENVOI'));
    } finally {
      this.submitting.set(false);
    }
  }
}
