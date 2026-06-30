import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, LowerCasePipe, SlicePipe } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Campagne,
  Progression,
  Releve,
  formatPeriodeCampagne,
} from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { extractGqlError } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-campagne-detail',
  imports: [RouterLink, DatePipe, DecimalPipe, LowerCasePipe, SlicePipe, ToastModule, ErrorBannerComponent, TranslatePipe],
  providers: [MessageService],
  templateUrl: './campagne-detail.component.html',
  styleUrl: './campagne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneDetailComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  readonly auth = inject(AuthService);

  private readonly campagneId: string;

  // ── État ───────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly progression = signal<Progression | null>(null);
  readonly releves = signal<Releve[]>([]);
  readonly relevesLoading = signal(false);
  readonly relevesLoaded = signal(false);
  readonly activeTab = signal(0);

  readonly cloturant = signal(false);

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

  readonly isCloturee = computed(() => this.campagne()?.statut === 'CLOTUREE');

  readonly relevesByStatut = computed(() => {
    const list = this.releves();
    return {
      aRelever: list.filter((r) => r.statut === 'A_RELEVER').length,
      releve: list.filter((r) => r.statut === 'RELEVE').length,
      nonReleve: list.filter((r) => r.statut === 'NON_RELEVE').length,
      estime: list.filter((r) => r.statut === 'ESTIME').length,
    };
  });

  constructor(route: ActivatedRoute) {
    this.campagneId = route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [campagne, progression] = await Promise.all([
        this.service.getCampagne(this.campagneId),
        this.service.getProgression(this.campagneId),
      ]);
      this.campagne.set(campagne);
      this.progression.set(progression);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  setActiveTab(index: number): void {
    this.activeTab.set(index);
    if (index === 1 && !this.relevesLoaded()) {
      this.loadReleves();
    }
  }

  private async loadReleves(): Promise<void> {
    this.relevesLoading.set(true);
    try {
      this.releves.set(await this.service.getReleves(this.campagneId));
      this.relevesLoaded.set(true);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.relevesLoading.set(false);
    }
  }

  async cloturer(): Promise<void> {
    if (this.cloturant()) return;
    this.cloturant.set(true);
    try {
      const updated = await this.service.cloturerCampagne(this.campagneId);
      this.campagne.update((c) => (c ? { ...c, ...updated } : c));
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
