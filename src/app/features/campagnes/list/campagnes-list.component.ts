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
import { DatePipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { QueryRef } from 'apollo-angular';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import {
  Campagne,
  CampagneAgent,
  StatutCampagne,
  formatPeriodeCampagne,
} from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';
import { ToastService } from '../../../shared/services/toast.service';

interface MiniProgression {
  nbReleves: number;
  totalAbonnes: number;
}

@Component({
  selector: 'app-campagnes-list',
  imports: [
    RouterLink,
    DatePipe,
    LowerCasePipe,
    FormsModule,
    SelectModule,
    ErrorBannerComponent,
    PageTopbarComponent,
    FilterBarComponent,
    DataTableComponent,
    DataTableCellDirective,
    TranslatePipe,
  ],
  templateUrl: './campagnes-list.component.html',
  styleUrl: './campagnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagnesListComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  private campagnesQuery!: QueryRef<{ campagnes: Campagne[] }>;

  // ── État liste ─────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagnes = signal<Campagne[]>([]);
  readonly filtreStatut = signal<StatutCampagne | 'TOUTES'>('TOUTES');
  readonly filtreAgent = signal<string | null>(null);
  readonly searchTerm = signal('');

  readonly columns: DataTableColumn[] = [
    { key: 'campagne', header: 'CAMPAGNES.COL_CAMPAGNE' },
    { key: 'planifiee', header: 'CAMPAGNES.COL_PLANIFIEE' },
    { key: 'agents', header: 'CAMPAGNES.COL_AGENTS' },
    { key: 'avancement', header: 'CAMPAGNES.COL_AVANCEMENT' },
    { key: 'statut', header: 'CAMPAGNES.COL_STATUT' },
    { key: 'actions', header: 'COMMON.ACTIONS' },
  ];
  /** Surligne discrètement les campagnes en cours. */
  readonly rowClassCampagne = (c: Campagne): string | null =>
    c.statut === 'EN_COURS' ? 'dt__row--active' : null;

  // Progressions chargées en arrière-plan après la liste
  readonly progressions = signal<Map<string, MiniProgression>>(new Map());

  readonly campagnesFiltrees = computed(() => {
    let list = this.campagnes();

    const statut = this.filtreStatut();
    if (statut !== 'TOUTES') list = list.filter((c) => c.statut === statut);

    const term = this.searchTerm().trim().toLowerCase();
    if (term) list = list.filter((c) => c.nom.toLowerCase().includes(term));

    const agent = this.filtreAgent();
    if (agent) list = list.filter((c) => c.agents?.some((a) => a.username === agent));

    return list;
  });

  readonly agentsDisponibles = computed(() => {
    const set = new Set<string>();
    this.campagnes().forEach((c) => c.agents?.forEach((a) => set.add(a.username)));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr')).map((u) => ({ label: u, value: u }));
  });

  readonly stats = computed(() => {
    const list = this.campagnes();
    const planifiees = list.filter((c) => c.statut === 'PLANIFIEE').length;
    const enCours = list.filter((c) => c.statut === 'EN_COURS').length;
    const cloturees = list.filter((c) => c.statut === 'CLOTUREE').length;
    return { planifiees, enCours, cloturees, total: list.length };
  });

  readonly statsSubtitle = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const { total, planifiees, enCours, cloturees } = this.stats();
    if (total === 0) return '';
    const parts: string[] = [
      this.translate.instant(
        total > 1 ? 'CAMPAGNES.STATS_TOTAL_PLURAL' : 'CAMPAGNES.STATS_TOTAL_SINGULAR',
        { count: total },
        lang,
      ),
    ];
    if (planifiees > 0) parts.push(this.translate.instant('CAMPAGNES.STATS_PLANIFIEES', { count: planifiees }, lang));
    if (enCours > 0) parts.push(this.translate.instant('CAMPAGNES.STATS_EN_COURS', { count: enCours }, lang));
    if (cloturees > 0) parts.push(this.translate.instant('CAMPAGNES.STATS_CLOTUREES', { count: cloturees }, lang));
    return parts.join(' · ');
  });

  readonly filtreOptions = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('CAMPAGNES.FILTRE.TOUTES', {}, lang), value: 'TOUTES' },
      { label: this.translate.instant('CAMPAGNES.STATUT.PLANIFIEE', {}, lang), value: 'PLANIFIEE' },
      { label: this.translate.instant('CAMPAGNES.STATUT.EN_COURS', {}, lang), value: 'EN_COURS' },
      { label: this.translate.instant('CAMPAGNES.STATUT.CLOTUREE', {}, lang), value: 'CLOTUREE' },
    ] as Array<{ label: string; value: StatutCampagne | 'TOUTES' }>;
  });

  readonly canCreate = computed(
    () => this.auth.isAdmin() || this.auth.role() === 'SUPERVISEUR',
  );

  // ── Clôture ────────────────────────────────────────────────────────────────
  readonly cloturantId = signal<string | null>(null);

  ngOnInit(): void {
    this.campagnesQuery = this.service.watchCampagnes();

    this.campagnesQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.campagnes) {
            this.campagnes.set(data.campagnes as Campagne[]);
            void this.loadProgressions(data.campagnes as Campagne[]);
          } else if (!loading) {
            this.error.set(this.translate.instant('CAMPAGNES.ERROR_LOAD'));
          }
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
          this.loading.set(false);
        },
      });
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      await this.campagnesQuery.refetch();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
    }
  }

  private async loadProgressions(campagnes: Campagne[]): Promise<void> {
    const results = await Promise.allSettled(
      campagnes.map((c) => this.service.getProgression(c.campagneId)),
    );
    const map = new Map<string, MiniProgression>();
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map.set(campagnes[i].campagneId, {
          nbReleves: r.value.nbReleves,
          totalAbonnes: r.value.totalAbonnes,
        });
      }
    });
    this.progressions.set(map);
  }

  formatAgents(agents: CampagneAgent[] | undefined): string {
    if (!agents?.length) return '—';
    return agents.map((a) => a.username).join(' · ');
  }

  formatPeriode(c: Campagne): string {
    const lang = this.translate.currentLang() ?? 'fr';
    return formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang);
  }

  progressionPct(prog: MiniProgression): number {
    return prog.totalAbonnes > 0
      ? Math.round((prog.nbReleves / prog.totalAbonnes) * 100)
      : 0;
  }

  // ── Création ───────────────────────────────────────────────────────────────

  navigateToCreate(): void {
    void this.router.navigate(['/campagnes', 'nouvelle']);
  }

  // ── Clôture ────────────────────────────────────────────────────────────────

  async cloturer(campagneId: string): Promise<void> {
    if (this.cloturantId()) return;
    this.cloturantId.set(campagneId);
    try {
      await this.service.cloturerCampagne(campagneId);
      await this.campagnesQuery.refetch();
      this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_CLOTUREE'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.cloturantId.set(null);
    }
  }
}
