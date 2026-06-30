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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, LowerCasePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { QueryRef } from 'apollo-angular';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import {
  Campagne,
  Progression,
  Releve,
  formatPeriodeCampagne,
} from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';

@Component({
  selector: 'app-campagne-detail',
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    LowerCasePipe,
    SlicePipe,
    FormsModule,
    ToastModule,
    SelectModule,
    ErrorBannerComponent,
    TranslatePipe,
  ],
  providers: [MessageService],
  templateUrl: './campagne-detail.component.html',
  styleUrl: './campagne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneDetailComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  private readonly campagneId: string;
  private campagneQuery!: QueryRef<{ campagne: Campagne }>;

  // ── État ───────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly progression = signal<Progression | null>(null);
  readonly releves = signal<Releve[]>([]);
  readonly cloturant = signal(false);

  // ── Filtres relevés ────────────────────────────────────────────────────────
  readonly filtreReleveStatut = signal('TOUS');
  readonly filtreQuartier = signal('TOUS');

  readonly periode = computed(() => {
    const c = this.campagne();
    const lang = this.translate.currentLang() ?? 'fr';
    return c ? formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang) : '';
  });

  readonly pourcentageAffiche = computed(() =>
    Math.round(this.progression()?.pourcentage ?? 0),
  );

  readonly canActOnCampagne = computed(
    () => this.auth.isAdmin() || this.auth.role() === 'SUPERVISEUR',
  );

  readonly relevesByStatut = computed(() => {
    const list = this.releves();
    return {
      aRelever: list.filter((r) => r.statut === 'A_RELEVER').length,
      releve: list.filter((r) => r.statut === 'RELEVE').length,
      nonReleve: list.filter((r) => r.statut === 'NON_RELEVE').length,
      estime: list.filter((r) => r.statut === 'ESTIME').length,
    };
  });

  readonly quartiersDisponibles = computed(() => {
    const all = this.releves()
      .map((r) => r.abonne?.quartier)
      .filter((q): q is string => !!q);
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  });

  readonly agentsLabel = computed(() => {
    const agents = this.campagne()?.agents;
    return agents?.length ? agents.map((a) => a.username).join(' · ') : null;
  });

  readonly quartierOptions = computed(() => [
    { label: this.translate.instant('CAMPAGNES.FILTRE_QUARTIER'), value: 'TOUS' },
    ...this.quartiersDisponibles().map((q) => ({ label: q, value: q })),
  ]);

  readonly statutReleveOptions = computed(() => [
    { label: this.translate.instant('CAMPAGNES.FILTRE_STATUT_RELEVE'), value: 'TOUS' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.RELEVE'), value: 'RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.ESTIME'), value: 'ESTIME' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.NON_RELEVE'), value: 'NON_RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.A_RELEVER'), value: 'A_RELEVER' },
  ]);

  readonly relevesFiltres = computed(() => {
    let list = this.releves();
    const statut = this.filtreReleveStatut();
    const quartier = this.filtreQuartier();
    if (statut !== 'TOUS') list = list.filter((r) => r.statut === statut);
    if (quartier !== 'TOUS') list = list.filter((r) => r.abonne?.quartier === quartier);
    return list;
  });

  constructor(route: ActivatedRoute) {
    this.campagneId = route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.campagneQuery = this.service.watchCampagne(this.campagneId);

    this.campagneQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          if (data?.campagne) this.campagne.set(data.campagne as Campagne);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
          this.loading.set(false);
        },
      });

    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [campagneResult, progression, releves] = await Promise.all([
        this.campagneQuery.refetch(),
        this.service.getProgression(this.campagneId),
        this.service.getReleves(this.campagneId),
      ]);
      this.campagne.set(campagneResult.data!.campagne as Campagne);
      this.progression.set(progression);
      this.releves.set(releves);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  async cloturer(): Promise<void> {
    if (this.cloturant()) return;
    this.cloturant.set(true);
    try {
      await this.service.cloturerCampagne(this.campagneId);
      await this.load();
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CAMPAGNES.SUCCESS_CLOTUREE'),
      });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.cloturant.set(false);
    }
  }
}
