import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfigurationService } from '../../core/configuration/configuration.service';
import { ConfigParam, InfosSociete } from '../../shared/models/configuration.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { extractGqlError } from '../../core/auth/auth.service';

@Component({
  selector: 'app-configuration',
  imports: [
    FormsModule,
    DatePipe,
    InputTextModule,
    ToastModule,
    ErrorBannerComponent,
    TranslatePipe,
  ],
  providers: [MessageService],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationComponent implements OnInit {
  private readonly service = inject(ConfigurationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // ── État global ────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // ── Infos société ──────────────────────────────────────────────────────────
  readonly infosSociete = signal<InfosSociete | null>(null);
  readonly societeNom = signal('');
  readonly societeAdresse = signal('');
  readonly societeTelephone = signal('');
  readonly societeLogoPath = signal('');
  readonly societeSaving = signal(false);
  readonly societeDirty = computed(() => {
    const s = this.infosSociete();
    if (!s) return false;
    return (
      this.societeNom() !== s.nom ||
      this.societeAdresse() !== s.adresse ||
      this.societeTelephone() !== s.telephone ||
      this.societeLogoPath() !== s.logoPath
    );
  });

  // ── Paramètres système ─────────────────────────────────────────────────────
  readonly configs = signal<ConfigParam[]>([]);
  readonly editingKey = signal<string | null>(null);
  readonly editingValue = signal('');
  readonly paramSaving = signal(false);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [infos, configs] = await Promise.all([
        this.service.getInfosSociete(),
        this.service.getConfigs(),
      ]);
      this.infosSociete.set(infos);
      this.societeNom.set(infos.nom);
      this.societeAdresse.set(infos.adresse);
      this.societeTelephone.set(infos.telephone);
      this.societeLogoPath.set(infos.logoPath);
      this.configs.set(configs);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CONFIGURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Infos société ──────────────────────────────────────────────────────────

  async saveSociete(): Promise<void> {
    if (this.societeSaving()) return;
    this.societeSaving.set(true);
    try {
      const updated = await this.service.updateInfosSociete({
        nom: this.societeNom().trim(),
        adresse: this.societeAdresse().trim(),
        telephone: this.societeTelephone().trim(),
        logoPath: this.societeLogoPath().trim(),
      });
      this.infosSociete.set(updated);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CONFIGURATION.SUCCESS_SOCIETE'),
      });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.societeSaving.set(false);
    }
  }

  resetSociete(): void {
    const s = this.infosSociete();
    if (!s) return;
    this.societeNom.set(s.nom);
    this.societeAdresse.set(s.adresse);
    this.societeTelephone.set(s.telephone);
    this.societeLogoPath.set(s.logoPath);
  }

  // ── Paramètres système ─────────────────────────────────────────────────────

  startEdit(param: ConfigParam): void {
    this.editingKey.set(param.cle);
    this.editingValue.set(param.valeur);
  }

  cancelEdit(): void {
    this.editingKey.set(null);
    this.editingValue.set('');
  }

  async saveParam(cle: string): Promise<void> {
    if (this.paramSaving()) return;
    this.paramSaving.set(true);
    try {
      const updated = await this.service.updateConfig(cle, this.editingValue().trim());
      this.configs.update((list) =>
        list.map((c) => (c.cle === updated.cle ? updated : c)),
      );
      this.editingKey.set(null);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CONFIGURATION.SUCCESS_PARAM'),
      });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.paramSaving.set(false);
    }
  }
}
