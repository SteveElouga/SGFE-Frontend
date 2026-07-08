import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Envoi, Facture, ModePaiement, Paiement, SoldeFacture, StatutFacture, factureStatutTone } from '../../../shared/models/facture.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { Abonne } from '../../../shared/models/abonne.model';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  imports: [
    FormsModule,
    DecimalPipe,
    SelectModule,
    InputTextModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FcfaPipe,
    BadgeComponent,
  ],
  templateUrl: './facture-detail.component.html',
  styleUrl: './facture-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactureDetailComponent implements OnInit {
  /** Exposé au template pour la teinte de la puce de statut. */
  protected readonly factureStatutTone = factureStatutTone;

  private readonly facturesService = inject(FacturesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly facturePdf = inject(FacturePdfService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pdfLoading = signal(false);

  readonly facture = signal<Facture | null>(null);
  readonly solde = signal<SoldeFacture | null>(null);
  readonly paiements = signal<Paiement[]>([]);
  readonly envois = signal<Envoi[]>([]);
  readonly abonne = signal<Abonne | null>(null);
  readonly campagne = signal<Campagne | null>(null);

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

  // Source autoritaire : le solde calculé par le backend (montant réellement dû
  // d'après les paiements enregistrés). Ne jamais s'appuyer sur le statut seul,
  // dont la synchro est dégradée côté backend.
  readonly soldeRestant = computed(() => this.solde()?.soldeRestant ?? 0);

  // Un paiement n'est possible que s'il reste un solde à régler. Le statut seul
  // ne suffit pas : sa synchro backend est dégradée (soldeRestant=0 possible
  // avec un statut encore IMPAYEE/PARTIELLE).
  readonly canAddPaiement = computed(() => this.soldeRestant() > 0);

  readonly montantExceedsSolde = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    return !Number.isNaN(montant) && montant > this.soldeRestant();
  });

  readonly panelValid = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    const refOk = !this.refRequired() || !!this.pRef().trim();
    return (
      !Number.isNaN(montant) &&
      montant > 0 &&
      montant <= this.soldeRestant() &&
      !!this.pDate() &&
      refOk
    );
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

  // Statut déductible du solde backend (autoritaire) : c'est le seul statut
  // cohérent avec l'argent réellement dû/payé.
  readonly statutCoherent = computed<StatutFacture | null>(() => {
    const s = this.solde();
    if (!s) return null;
    if (s.montantPaye <= 0) return 'IMPAYEE';
    if (s.soldeRestant <= 0) return 'PAYEE';
    return 'PARTIELLE';
  });

  // La correction manuelle sélectionnée contredit-elle le solde réel ?
  readonly statutCorrectionIncoherent = computed(() => {
    const chosen = this.newStatut();
    const coherent = this.statutCoherent();
    return !!chosen && !!coherent && chosen !== coherent;
  });

  // Message expliquant l'incohérence (solde vs statut choisi).
  readonly statutIncoherentMsg = computed(() => {
    if (!this.statutCorrectionIncoherent()) return '';
    const lang = this.translate.currentLang() ?? undefined;
    const coherent = this.statutCoherent();
    const statutLabel = coherent
      ? this.translate.instant('FACTURATION.STATUT.' + coherent, {}, lang)
      : '';
    return this.translate.instant(
      'FACTURATION.DETAIL.STATUT_INCOHERENT',
      { solde: this.soldeRestant().toLocaleString('fr-FR'), statut: statutLabel },
      lang,
    );
  });

  readonly abonneLabel = computed(() => {
    const a = this.abonne();
    return a ? `${a.prenom} ${a.nom}`.trim() : '';
  });

  readonly compteurLabel = computed(() => {
    const c = this.abonne()?.compteur;
    return c ? `C-${c.numeroCompteur} · ${c.quartier}, Camp ${c.camp}` : null;
  });

  readonly campagneLabel = computed(() => this.campagne()?.nom ?? '');

  readonly periodeLabel = computed(() => {
    const c = this.campagne();
    if (!c) return null;
    const lang = this.translate.currentLang() ?? 'fr';
    return formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang);
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

  // Ouverture directe du panneau de paiement (lien « + Paiement » depuis Impayés).
  private readonly autoOpenPaiement = signal(false);

  ngOnInit(): void {
    const factureId = this.route.snapshot.params['factureId'] as string;
    this.autoOpenPaiement.set(this.route.snapshot.queryParams['paiement'] === '1');
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
        if (this.autoOpenPaiement() && facture.statut !== 'PAYEE') {
          this.showForm.set(true);
        }
      }
      void this.loadRefs(facture);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('FACTURATION.DETAIL.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRefs(f: Facture): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (f.abonneId) {
      tasks.push(
        this.abonnesService
          .getAbonne(f.abonneId)
          .then((a) => this.abonne.set(a))
          .catch(() => undefined),
      );
    }
    if (f.campagneId) {
      tasks.push(
        this.campagnesService
          .getCampagne(f.campagneId)
          .then((c) => this.campagne.set(c))
          .catch(() => undefined),
      );
    }
    await Promise.allSettled(tasks);
  }

  async reload(): Promise<void> {
    const factureId = this.route.snapshot.params['factureId'] as string;
    await this.load(factureId);
  }

  // Le PDF est servi par un endpoint REST protégé par le JWT — voir
  // FacturePdfService (récupération blob + Bearer via l'intercepteur).
  async openPdf(): Promise<void> {
    const f = this.facture();
    if (!f || this.pdfLoading()) return;
    this.pdfLoading.set(true);
    try {
      await this.facturePdf.open(f.factureId, `facture-${f.numeroFacture ?? f.factureId}.pdf`);
    } catch {
      this.toast.error(this.translate.instant('FACTURATION.DETAIL.PDF_ERROR'));
    } finally {
      this.pdfLoading.set(false);
    }
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
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_PAIEMENT'));
      this.showForm.set(false);
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
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
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_WHATSAPP'));
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    }
  }

  async corrigerStatut(): Promise<void> {
    const f = this.facture();
    const statut = this.newStatut();
    if (!f || !statut || statut === f.statut || this.changingStatut()) return;
    // Refuser une correction qui contredirait le solde backend (autoritaire).
    if (this.statutCorrectionIncoherent()) return;
    this.changingStatut.set(true);
    try {
      const updated = await this.facturesService.updateStatutFacture(f.factureId, statut);
      this.facture.update((prev) => prev ? { ...prev, statut: updated.statut } : prev);
      this.newStatut.set(null);
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_STATUT'));
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.changingStatut.set(false);
    }
  }

  goBack(): void {
    void this.router.navigateByUrl(this.backLink());
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
