import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Campagne, StatutCampagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { extractGqlError } from '../../../core/auth/auth.service';

const MOIS_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ label: '', value: i + 1 }));

@Component({
  selector: 'app-campagnes-list',
  imports: [
    RouterLink,
    DatePipe,
    FormsModule,
    ToastModule,
    TableModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    ErrorBannerComponent,
    TranslatePipe,
  ],
  providers: [MessageService],
  templateUrl: './campagnes-list.component.html',
  styleUrl: './campagnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagnesListComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  readonly auth = inject(AuthService);

  // ── État liste ─────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagnes = signal<Campagne[]>([]);
  readonly filtreStatut = signal<StatutCampagne | 'TOUTES'>('TOUTES');

  readonly campagnesFiltrees = computed(() => {
    const f = this.filtreStatut();
    const list = this.campagnes();
    return f === 'TOUTES' ? list : list.filter((c) => c.statut === f);
  });

  readonly stats = computed(() => {
    const list = this.campagnes();
    const enCours = list.filter((c) => c.statut === 'EN_COURS').length;
    const cloturees = list.filter((c) => c.statut === 'CLOTUREE').length;
    return { enCours, cloturees, total: list.length };
  });

  readonly moisOptions = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return MOIS_OPTIONS.map((o) => ({
      ...o,
      label: this.translate.instant(`CAMPAGNES.MOIS.${o.value}`, {}, lang),
    }));
  });

  readonly anneeOptions = computed(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1].map((y) => ({ label: String(y), value: y }));
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

  // ── Dialog création ────────────────────────────────────────────────────────
  readonly dialogVisible = signal(false);
  readonly creating = signal(false);
  readonly formNom = signal('');
  readonly formMois = signal(new Date().getMonth() + 1);
  readonly formAnnee = signal(new Date().getFullYear());
  readonly formDatePlanifiee = signal('');

  readonly canCreate = computed(
    () => this.auth.isAdmin() || this.auth.role() === 'SUPERVISEUR',
  );

  readonly formValid = computed(
    () => this.formNom().trim().length > 0 && this.formMois() > 0 && this.formAnnee() > 0,
  );

  // ── Clôture ────────────────────────────────────────────────────────────────
  readonly cloturantId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.campagnes.set(await this.service.getCampagnes());
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CAMPAGNES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  formatPeriode(c: Campagne): string {
    const lang = this.translate.currentLang() ?? 'fr';
    return formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang);
  }

  // ── Création ───────────────────────────────────────────────────────────────

  openDialog(): void {
    this.formNom.set('');
    this.formMois.set(new Date().getMonth() + 1);
    this.formAnnee.set(new Date().getFullYear());
    this.formDatePlanifiee.set('');
    this.dialogVisible.set(true);
  }

  async creer(): Promise<void> {
    if (!this.formValid() || this.creating()) return;
    this.creating.set(true);
    try {
      const created = await this.service.creerCampagne({
        nom: this.formNom().trim(),
        periodeMois: this.formMois(),
        periodeAnnee: this.formAnnee(),
        datePlanifiee: this.formDatePlanifiee().trim(),
      });
      this.campagnes.update((list) => [created, ...list]);
      this.dialogVisible.set(false);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CAMPAGNES.SUCCESS_CREE'),
      });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.creating.set(false);
    }
  }

  // ── Clôture ────────────────────────────────────────────────────────────────

  async cloturer(campagneId: string): Promise<void> {
    if (this.cloturantId()) return;
    this.cloturantId.set(campagneId);
    try {
      const updated = await this.service.cloturerCampagne(campagneId);
      this.campagnes.update((list) =>
        list.map((c) => (c.campagneId === updated.campagneId ? { ...c, ...updated } : c)),
      );
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
      this.cloturantId.set(null);
    }
  }
}
