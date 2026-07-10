import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Envoi } from '../../shared/models/facture.model';
import { BadgeComponent, BadgeTone } from '../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../shared/services/toast.service';

type StatutEnvoi = 'ENVOYE' | 'ECHEC' | 'EN_ATTENTE';

/**
 * Écran Envois — historique global des messages WhatsApp (facture / relances /
 * suspension / rétablissement), avec renvoi des échecs. Alimenté par la query
 * `envois` sans filtre (ADMIN, COMPTABLE). Complète le journal par-facture.
 */
@Component({
  selector: 'app-envois-list',
  standalone: true,
  imports: [FormsModule, SelectModule, TranslatePipe, BadgeComponent, ErrorBannerComponent, PageTopbarComponent],
  templateUrl: './envois-list.component.html',
  styleUrl: './envois-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvoisListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly envois = signal<Envoi[]>([]);
  readonly resending = signal<string | null>(null);
  readonly filtre = signal<'TOUS' | StatutEnvoi>('TOUS');

  readonly filtreOptions = computed((): Array<{ label: string; value: 'TOUS' | StatutEnvoi }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('ENVOIS.FILTRE_TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('ENVOIS.STATUT.ENVOYE', {}, lang), value: 'ENVOYE' },
      { label: this.translate.instant('ENVOIS.STATUT.ECHEC', {}, lang), value: 'ECHEC' },
      { label: this.translate.instant('ENVOIS.STATUT.EN_ATTENTE', {}, lang), value: 'EN_ATTENTE' },
    ];
  });

  readonly rows = computed((): Envoi[] => {
    const f = this.filtre();
    const list = this.envois();
    return f === 'TOUS' ? list : list.filter((e) => e.statut === f);
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const envois = await this.service.getAllEnvois();
      this.envois.set([...envois].sort((a, b) => (b.dateEnvoi ?? '').localeCompare(a.dateEnvoi ?? '')));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('ENVOIS.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  async renvoyer(e: Envoi): Promise<void> {
    if (this.resending()) return;
    this.resending.set(e.envoiId);
    try {
      await this.service.renvoyerEnvoi(e.envoiId);
      this.toast.success(this.translate.instant('ENVOIS.RESEND_OK'));
      await this.load();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.resending.set(null);
    }
  }

  statutTone(statut: string): BadgeTone {
    if (statut === 'ENVOYE') return 'success';
    if (statut === 'ECHEC') return 'danger';
    return 'warning';
  }

  /** Libellé traduit d'un type d'envoi, avec repli sur la valeur brute. */
  typeLabel(t: string | undefined): string {
    const raw = t || 'FACTURE';
    const key = 'ENVOIS.TYPE.' + raw;
    const label = this.translate.instant(key);
    return label === key ? raw : label;
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  }
}
