import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { nomAbonne } from '../../../shared/utils/abonne.utils';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { DetteAbonne, Envoi, Facture, Paiement, SoldeFacture, StatutFacture, factureStatutTone } from '../../../shared/models/facture.model';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { Abonne } from '../../../shared/models/abonne.model';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { PaiementFormComponent } from '../../../shared/components/paiement-form/paiement-form.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { FcfaPipe } from '../../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  imports: [
    FormsModule,
    DecimalPipe,
    DatePipe,
    SelectModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    PaiementFormComponent,
    TooltipDirective,
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

  /**
   * Ce que l'abonné doit EN PLUS de cette facture.
   *
   * Le PDF l'imprime déjà ; l'écran l'ignorait. Un comptable qui consulte une
   * facture à l'écran doit voir la même chose que l'abonné qui la reçoit —
   * sinon les deux ne parlent pas du même montant à payer.
   *
   * `null` tant que rien n'est chargé, et masqué à zéro : une ligne
   * « solde antérieur : 0 » sur la facture d'un abonné à jour est du bruit, et
   * elle habituerait l'œil à l'ignorer le jour où elle porte un montant.
   */
  readonly soldeAnterieur = signal<DetteAbonne | null>(null);

  readonly aUnSoldeAnterieur = computed(() => (this.soldeAnterieur()?.totalDu ?? 0) > 0);

  /**
   * La dette antérieure est-elle déjà exigible ?
   *
   * `plusAncienneEcheance` peut tomber dans le futur : une facture émise mais
   * pas encore échue compte dans le solde sans être en retard. Écrire « dus
   * depuis le 01/09 » pour une date à venir serait faux, et donnerait à un
   * comptable un argument de relance qui n'existe pas.
   */
  readonly soldeAnterieurEchu = computed(() => {
    const d = this.soldeAnterieur()?.plusAncienneEcheance;
    if (!d) return false;
    const echeance = new Date(d);
    return !Number.isNaN(echeance.getTime()) && echeance.getTime() < Date.now();
  });

  /** Consommation du mois plus dette antérieure — ce que l'abonné doit régler. */
  readonly totalAPayer = computed(() => {
    const f = this.facture();
    if (!f) return 0;
    return f.montant + (this.soldeAnterieur()?.totalDu ?? 0);
  });
  readonly error = signal<string | null>(null);
  readonly pdfLoading = signal(false);

  readonly facture = signal<Facture | null>(null);
  readonly solde = signal<SoldeFacture | null>(null);
  readonly paiements = signal<Paiement[]>([]);
  readonly envois = signal<Envoi[]>([]);
  readonly abonne = signal<Abonne | null>(null);
  readonly campagne = signal<Campagne | null>(null);

  readonly showForm = signal(false);
  readonly changingStatut = signal(false);
  readonly newStatut = signal<StatutFacture | null>(null);

  readonly statutOptions: Array<{ label: string; value: StatutFacture }> = [
    { label: 'Impayée', value: 'IMPAYEE' },
    { label: 'Partielle', value: 'PARTIELLE' },
    { label: 'Payée', value: 'PAYEE' },
  ];

  readonly pctPaye = computed(() => {
    const s = this.solde();
    if (!s || s.montantTotal === 0) return 0;
    return Math.min(100, Math.round((s.montantPaye / s.montantTotal) * 100));
  });

  // Source autoritaire : le solde calculé par le backend (montant réellement dû
  // d'après les paiements enregistrés). Ne jamais s'appuyer sur le statut seul,
  // dont la synchro est dégradée côté backend.
  readonly soldeRestant = computed(() => this.solde()?.soldeRestant ?? 0);

  // Un paiement n'est possible que s'il reste un solde à régler. Le statut seul
  // ne suffit pas : sa synchro backend est dégradée (soldeRestant=0 possible
  // avec un statut encore IMPAYEE/PARTIELLE).
  readonly canAddPaiement = computed(() => this.soldeRestant() > 0);

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
    // Repli sur le nom enrichi porté par la facture quand l'abonné n'est pas
    // résolu (query `abonne` refusée au COMPTABLE).
    return a ? nomAbonne(a.prenom, a.nom) : (this.facture()?.abonneNom ?? '');
  });

  /** Sous-titre mobile du header navy (MB-05) : « Koné Mariam · AB-0002 ». */
  readonly topbarSubtitle = computed(() => {
    const nom = this.abonneLabel();
    const numero = this.abonne()?.numeroAbonne ?? this.facture()?.abonneNumero;
    if (!nom && !numero) return '';
    return [nom, numero].filter(Boolean).join(' · ');
  });

  readonly compteurLabel = computed(() => {
    const c = this.abonne()?.compteur;
    return c ? `C-${c.numeroCompteur} · ${c.quartier}, Camp ${c.camp}` : null;
  });

  readonly campagneLabel = computed(() => this.campagne()?.nom ?? this.facture()?.campagneNom ?? '');

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
    void this.load(factureId);
  }

  /**
   * Charge la dette hors facture courante. Non bloquant : si Paiement est
   * injoignable, l'écran s'affiche sans la ligne plutôt que d'échouer — même
   * dégradation gracieuse que la génération du PDF.
   */
  private async loadSoldeAnterieur(facture: Facture): Promise<void> {
    if (!facture.abonneId) return;
    try {
      this.soldeAnterieur.set(
        await this.facturesService.getDetteAbonne(facture.abonneId, facture.factureId),
      );
    } catch {
      this.soldeAnterieur.set(null);
    }
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
      if (solde.soldeRestant > 0 && this.autoOpenPaiement() && facture.statut !== 'PAYEE') {
        this.showForm.set(true);
      }
      void this.loadRefs(facture);
      void this.loadSoldeAnterieur(facture);
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

  /**
   * Callback émis par `<app-paiement-form>` (shared) après enregistrement
   * réussi. Le composant partagé gère la validation, l'appel API et l'a11y ;
   * ici on ferme le formulaire, notifie l'utilisateur et rafraîchit les
   * données dérivées (solde, statut, historique).
   */
  async onPaiementSaved(): Promise<void> {
    this.toast.success(this.translate.instant('FACTURATION.SUCCESS_PAIEMENT'));
    this.showForm.set(false);
    await this.reload();
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

  /** Rejoue un envoi WhatsApp précis (échoué) depuis le journal. */
  async rejouerEnvoi(envoiId: string): Promise<void> {
    try {
      await this.facturesService.renvoyerEnvoi(envoiId);
      this.toast.success(this.translate.instant('FACTURATION.SUCCESS_WHATSAPP'));
      await this.reload();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    }
  }

  /** Premier clic : on demande confirmation. Deuxième : on applique. */
  readonly confirmationCorrection = signal(false);

  annulerCorrection(): void {
    this.confirmationCorrection.set(false);
  }

  async corrigerStatut(): Promise<void> {
    const f = this.facture();
    const statut = this.newStatut();
    if (!f || !statut || statut === f.statut || this.changingStatut()) return;
    // Refuser une correction qui contredirait le solde backend (autoritaire).
    if (this.statutCorrectionIncoherent()) return;

    // Forcer un statut n'enregistre aucun paiement : on ne le fait pas d'un
    // seul clic sur un document comptable.
    if (!this.confirmationCorrection()) {
      this.confirmationCorrection.set(true);
      return;
    }
    this.confirmationCorrection.set(false);
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
    if (envoi.erreur) return 'journal-entry--error';
    const t = envoi.typeEnvoi?.toUpperCase() ?? '';
    if (t.includes('RAPPEL') || t.includes('ETAPE_2')) return 'journal-entry--warn';
    if (t.includes('AVERT') || t.includes('ETAPE_3')) return 'journal-entry--error';
    return '';
  }

  /** Libellé du type d'envoi (ENVOIS.TYPE.*), repli sur la valeur brute. */
  envoiTypeLabel(envoi: Envoi): string {
    const type = envoi.typeEnvoi ?? 'FACTURE';
    const key = `ENVOIS.TYPE.${type.toUpperCase()}`;
    const label = this.translate.instant(key) as string;
    return label === key ? type : label;
  }

  /** Libellé du statut d'envoi (ENVOIS.STATUT.*), déduit de l'erreur à défaut. */
  envoiStatutLabel(envoi: Envoi): string {
    const statut = envoi.statut || (envoi.erreur ? 'ECHEC' : 'ENVOYE');
    const key = `ENVOIS.STATUT.${statut.toUpperCase()}`;
    const label = this.translate.instant(key) as string;
    return label === key ? statut : label;
  }

  /**
   * Nettoie un message d'erreur technique pour l'affichage : retire les URLs
   * (traces de la librairie WhatsApp) et tronque — le message complet reste
   * disponible au survol (`title`).
   */
  cleanErreur(erreur: string): string {
    const sansUrl = erreur.replace(/\s*\(?https?:\/\/\S*\)?/g, '').replace(/\s{2,}/g, ' ').trim();
    return sansUrl.length > 120 ? `${sansUrl.slice(0, 119)}…` : sansUrl;
  }
}
