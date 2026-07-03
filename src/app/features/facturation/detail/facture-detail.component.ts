import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { FacturesService } from '../../../core/factures/factures.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Envoi, Facture, ModePaiement, Paiement, SoldeFacture, StatutFacture } from '../../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';

@Component({
  imports: [
    FormsModule,
    DecimalPipe,
    SlicePipe,
    ToastModule,
    SelectModule,
    InputTextModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
  ],
  providers: [MessageService],
  templateUrl: './facture-detail.component.html',
  styleUrl: './facture-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactureDetailComponent implements OnInit {
  private readonly facturesService = inject(FacturesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly facture = signal<Facture | null>(null);
  readonly solde = signal<SoldeFacture | null>(null);
  readonly paiements = signal<Paiement[]>([]);
  readonly envois = signal<Envoi[]>([]);

  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly changingStatut = signal(false);
  readonly newStatut = signal<StatutFacture | null>(null);
  readonly pMontant = signal('');
  readonly pMode = signal<ModePaiement>('ESPECES');
  readonly pDate = signal('');
  readonly pRef = signal('');

  readonly statutOptions: Array<{ label: string; value: StatutFacture }> = [
    { label: 'Impayée', value: 'IMPAYEE' },
    { label: 'Partielle', value: 'PARTIELLE' },
    { label: 'Payée', value: 'PAYEE' },
  ];

  readonly modeOptions = computed((): Array<{ label: string; value: ModePaiement }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('FACTURATION.MODE.ESPECES', {}, lang), value: 'ESPECES' },
      { label: this.translate.instant('FACTURATION.MODE.MOBILE_MONEY', {}, lang), value: 'MOBILE_MONEY' },
      { label: this.translate.instant('FACTURATION.MODE.CHEQUE', {}, lang), value: 'CHEQUE' },
      { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' },
    ];
  });

  readonly pctPaye = computed(() => {
    const s = this.solde();
    if (!s || s.montantTotal === 0) return 0;
    return Math.min(100, Math.round((s.montantPaye / s.montantTotal) * 100));
  });

  readonly refRequired = computed(
    () => this.pMode() === 'MOBILE_MONEY' || this.pMode() === 'VIREMENT',
  );

  readonly panelValid = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    const refOk = !this.refRequired() || !!this.pRef().trim();
    return !Number.isNaN(montant) && montant > 0 && !!this.pDate() && refOk;
  });

  readonly confirmLabel = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    const lang = this.translate.currentLang() ?? undefined;
    if (Number.isNaN(montant) || montant <= 0) {
      return this.translate.instant('FACTURATION.PANEL_CONFIRM_EMPTY', {}, lang);
    }
    return this.translate.instant(
      'FACTURATION.PANEL_CONFIRM',
      { montant: montant.toLocaleString('fr-FR') },
      lang,
    );
  });

  readonly backLink = computed(() => {
    const f = this.facture();
    return f?.campagneId ? `/factures/campagne/${f.campagneId}` : '/dashboard';
  });

  readonly waButtonLabel = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.envois().length === 0
      ? this.translate.instant('FACTURATION.DETAIL.BTN_ENVOYER_WA', {}, lang)
      : this.translate.instant('FACTURATION.DETAIL.BTN_RENVOYER_WA', {}, lang);
  });

  ngOnInit(): void {
    const factureId = this.route.snapshot.params['factureId'] as string;
    this.pDate.set(new Date().toISOString().split('T')[0]);
    void this.load(factureId);
  }

  async load(factureId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [facture, solde, paiements, envois] = await Promise.all([
        this.facturesService.getFacture(factureId),
        this.facturesService.getSoldeFacture(factureId),
        this.facturesService.getPaiements(factureId),
        this.facturesService.getEnvois(factureId),
      ]);
      this.facture.set(facture);
      this.solde.set(solde);
      this.paiements.set(paiements);
      this.envois.set(envois);
      if (solde.soldeRestant > 0) {
        this.pMontant.set(String(solde.soldeRestant));
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('FACTURATION.DETAIL.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  async reload(): Promise<void> {
    const factureId = this.route.snapshot.params['factureId'] as string;
    await this.load(factureId);
  }

  async submitPaiement(): Promise<void> {
    const f = this.facture();
    if (!f || !this.panelValid() || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.facturesService.enregistrerPaiement({
        factureId: f.factureId,
        abonneId: f.abonneId,
        montant: Number.parseFloat(this.pMontant()),
        datePaiement: this.pDate(),
        modePaiement: this.pMode(),
        referenceTransaction: this.pRef() || undefined,
      });
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('FACTURATION.SUCCESS_PAIEMENT'),
      });
      this.showForm.set(false);
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.submitting.set(false);
    }
  }

  async envoyerWhatsapp(): Promise<void> {
    const f = this.facture();
    if (!f) return;
    try {
      if (this.envois().length === 0) {
        await this.facturesService.envoyerFactureWhatsapp(f.factureId, f.abonneId);
      } else {
        await this.facturesService.renvoyerFactureWhatsapp(f.factureId);
      }
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('FACTURATION.SUCCESS_WHATSAPP'),
      });
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    }
  }

  async corrigerStatut(): Promise<void> {
    const f = this.facture();
    const statut = this.newStatut();
    if (!f || !statut || statut === f.statut || this.changingStatut()) return;
    this.changingStatut.set(true);
    try {
      const updated = await this.facturesService.updateStatutFacture(f.factureId, statut);
      this.facture.update((prev) => prev ? { ...prev, statut: updated.statut } : prev);
      this.newStatut.set(null);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('FACTURATION.SUCCESS_STATUT'),
      });
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || this.translate.instant('ERRORS.GENERIC') });
    } finally {
      this.changingStatut.set(false);
    }
  }

  goBack(): void {
    void this.router.navigateByUrl(this.backLink());
  }

  formatFCFA(n: number): string {
    return `${n.toLocaleString('fr-FR')} FCFA`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  envoiClass(envoi: Envoi): string {
    const t = envoi.typeEnvoi?.toUpperCase() ?? '';
    if (t.includes('RAPPEL') || t.includes('ETAPE_2')) return 'journal-entry--warn';
    if (t.includes('AVERT') || t.includes('ETAPE_3')) return 'journal-entry--error';
    return '';
  }
}
