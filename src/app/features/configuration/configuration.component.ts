import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfigurationService } from '../../core/configuration/configuration.service';
import { FacturesService } from '../../core/factures/factures.service';
import { ConfigParam, InfosSociete } from '../../shared/models/configuration.model';
import { Tarif } from '../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { extractGqlError } from '../../core/auth/auth.service';

@Component({
  selector: 'app-configuration',
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    InputTextModule,
    ToastModule,
    ErrorBannerComponent,
    PageTopbarComponent,
    TranslatePipe,
  ],
  providers: [MessageService],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationComponent implements OnInit {
  private readonly service = inject(ConfigurationService);
  private readonly facturesService = inject(FacturesService);
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

  // ── Infos société — mode édition ───────────────────────────────────────────
  readonly editingSociete = signal(false);

  // ── Tarif actuel ───────────────────────────────────────────────────────────
  readonly tarifActuel = signal<Tarif | null>(null);
  readonly editingTarif = signal(false);
  readonly tarifPrixM3 = signal('');
  readonly tarifDateEffet = signal('');
  readonly tarifSaving = signal(false);
  readonly tarifDirty = computed(() => {
    const t = this.tarifActuel();
    const prix = Number.parseFloat(this.tarifPrixM3());
    if (Number.isNaN(prix) || prix <= 0) return false;
    if (!this.tarifDateEffet()) return false;
    if (!t) return true;
    return prix !== t.prixM3 || this.tarifDateEffet() !== t.dateEffet;
  });

  // ── Paramètres système ─────────────────────────────────────────────────────
  readonly configs = signal<ConfigParam[]>([]);
  readonly editingKey = signal<string | null>(null);
  readonly editingValue = signal('');
  readonly paramSaving = signal(false);

  // ── Groupes de paramètres (par préfixe de clé) ─────────────────────────────
  readonly tarifParams = computed(() =>
    this.configs().filter(
      (c) =>
        c.cle.includes('PRIX') ||
        c.cle.includes('TARIF') ||
        c.cle.includes('DELAI_PAIE'),
    ),
  );
  readonly relanceParams = computed(() =>
    this.configs().filter(
      (c) => c.cle.includes('RELANCE') || c.cle.includes('SUSPENSION'),
    ),
  );
  readonly integrationParams = computed(() =>
    this.configs().filter(
      (c) =>
        c.cle.includes('TELNYX') ||
        c.cle.includes('WHATSAPP') ||
        c.cle.includes('TOKEN'),
    ),
  );
  readonly otherParams = computed(() => {
    const known = new Set([
      ...this.tarifParams().map((c) => c.cle),
      ...this.relanceParams().map((c) => c.cle),
      ...this.integrationParams().map((c) => c.cle),
    ]);
    return this.configs().filter((c) => !known.has(c.cle));
  });

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [infos, configs, tarif] = await Promise.all([
        this.service.getInfosSociete(),
        this.service.getConfigs(),
        this.facturesService.getTarifActuel(),
      ]);
      this.infosSociete.set(infos);
      this.societeNom.set(infos.nom);
      this.societeAdresse.set(infos.adresse);
      this.societeTelephone.set(infos.telephone);
      this.societeLogoPath.set(infos.logoPath);
      this.configs.set(configs);
      this.tarifActuel.set(tarif);
      if (tarif) {
        this.tarifPrixM3.set(String(tarif.prixM3));
        this.tarifDateEffet.set(tarif.dateEffet);
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CONFIGURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Tarif actuel ──────────────────────────────────────────────────────────

  editTarif(): void {
    this.editingTarif.set(true);
  }

  resetTarif(): void {
    const t = this.tarifActuel();
    this.tarifPrixM3.set(t ? String(t.prixM3) : '');
    this.tarifDateEffet.set(t?.dateEffet ?? '');
    this.editingTarif.set(false);
  }

  async saveTarif(): Promise<void> {
    if (this.tarifSaving() || !this.tarifDirty()) return;
    this.tarifSaving.set(true);
    try {
      const updated = await this.facturesService.updateTarif(
        Number.parseFloat(this.tarifPrixM3()),
        this.tarifDateEffet(),
      );
      this.tarifActuel.set(updated);
      this.editingTarif.set(false);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CONFIGURATION.SUCCESS_TARIF'),
      });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.tarifSaving.set(false);
    }
  }

  // ── Infos société ──────────────────────────────────────────────────────────

  editSociete(): void {
    this.editingSociete.set(true);
  }

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
      this.editingSociete.set(false);
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
    this.editingSociete.set(false);
  }

  // ── Paramètres système ─────────────────────────────────────────────────────

  isBoolParam(param: ConfigParam): boolean {
    return param.valeur === 'true' || param.valeur === 'false';
  }

  isNumericParam(param: ConfigParam): boolean {
    if (this.isBoolParam(param)) return false;
    return param.valeur.trim() !== '' && !Number.isNaN(Number(param.valeur));
  }

  async toggleBoolParam(cle: string, currentValue: string): Promise<void> {
    if (this.paramSaving()) return;
    const next = currentValue === 'true' ? 'false' : 'true';
    this.paramSaving.set(true);
    try {
      const updated = await this.service.updateConfig(cle, next);
      this.configs.update((list) =>
        list.map((c) => (c.cle === updated.cle ? updated : c)),
      );
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
