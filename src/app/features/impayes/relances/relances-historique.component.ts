import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FacturesService } from '../../../core/factures/factures.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Facture, SoldeFacture, SuiviImpaye } from '../../../shared/models/facture.model';
import { Abonne } from '../../../shared/models/abonne.model';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';
import { formatFcfa } from '../../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../../shared/services/toast.service';

/** Délais par défaut des relances graduées (configurables dans Paramètres). */
const STAGES = [
  { numero: 1, offsetJours: 0, titleKey: 'RELANCES.STAGE1.TITLE', msgKey: 'RELANCES.STAGE1.MSG' },
  { numero: 2, offsetJours: 3, titleKey: 'RELANCES.STAGE2.TITLE', msgKey: 'RELANCES.STAGE2.MSG' },
  { numero: 3, offsetJours: 7, titleKey: 'RELANCES.STAGE3.TITLE', msgKey: 'RELANCES.STAGE3.MSG' },
  { numero: 4, offsetJours: 10, titleKey: 'RELANCES.STAGE4.TITLE', msgKey: 'RELANCES.STAGE4.MSG' },
] as const;

/** Cooldown post-envoi WhatsApp : évite le double-envoi accidentel + laisse au
 *  backend le temps de propager (idempotence non garantie côté gateway). */
const RENVOI_COOLDOWN_SECONDS = 60;

interface StepVm {
  numero: number;
  done: boolean;
  isSuspension: boolean;
  toneClass: string;
  title: string;
  message: string;
  dateLabel: string;
  /** Date ISO pour <time datetime="..."> — parseurs machine + a11y (SR annonce). */
  dateIso: string | null;
  deliveredLabel: string | null;
  scheduledLabel: string | null;
  adminBadge: string | null;
  suspensionBadge: string | null;
}

@Component({
  imports: [TranslatePipe, ErrorBannerComponent, PageTopbarComponent, BottomSheetComponent],
  templateUrl: './relances-historique.component.html',
  styleUrl: './relances-historique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelancesHistoriqueComponent implements OnInit {
  private readonly facturesService = inject(FacturesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly renvoi = signal(false);

  /** Sheet de confirmation avant envoi WhatsApp — communication client irréversible. */
  readonly renvoiConfirmOpen = signal(false);
  /** Secondes restantes avant de pouvoir renvoyer à nouveau (garde-fou double-envoi). */
  readonly renvoiCooldown = signal(0);

  readonly facture = signal<Facture | null>(null);
  readonly solde = signal<SoldeFacture | null>(null);
  readonly abonne = signal<Abonne | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly suivi = signal<SuiviImpaye | null>(null);

  readonly abonneNom = computed(() => {
    const a = this.abonne();
    return a ? `${a.prenom} ${a.nom}`.trim() : '—';
  });

  readonly numeroAbonne = computed(() => this.abonne()?.numeroAbonne ?? '');

  readonly soldeRestant = computed(() => this.solde()?.soldeRestant ?? 0);

  readonly etapeActuelle = computed(() => this.suivi()?.etapeActuelle ?? 0);

  readonly estSuspendu = computed(() => this.etapeActuelle() >= 4);

  /**
   * Jours de retard, calculés depuis la **date limite de la facture**.
   *
   * Ils se prenaient sur `suivi.dateDepassement` — or le `SuiviImpaye` n'est
   * créé que par le cron de relance, à sa première escalade. Tant qu'il n'a pas
   * tourné, il n'existe pas : le retard retombait à zéro et l'écran annonçait
   * « dépassée de 0 jours », puis « Échéance aujourd'hui » après un premier
   * correctif qui n'avait changé que le libellé.
   *
   * Mesuré sur cet environnement : six factures à 31 jours de retard, zéro
   * `SuiviImpaye` en base. La date limite de la facture, elle, est toujours
   * là — c'est la seule source fiable.
   */
  readonly retardJours = computed(() => {
    const limite = this.facture()?.dateLimitePaiement ?? null;
    const depuisFacture = this.joursDepuis(limite);
    if (depuisFacture !== null) return depuisFacture;
    return this.joursDepuis(this.suivi()?.dateDepassement ?? null) ?? 0;
  });

  readonly resolu = computed(() => !!this.suivi()?.resoluLe);

  readonly breadcrumb = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('RELANCES.BREADCRUMB', { nom: this.abonneNom() }, lang);
  });

  readonly headerMeta = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const jours = this.retardJours();
    // « Échéance dépassée de 0 jours » n'a pas de sens : à zéro, l'échéance
    // tombe aujourd'hui. Et « 1 jours » n'en a pas davantage.
    const cle =
      jours <= 0
        ? 'RELANCES.HEADER_META_AUJ'
        : jours === 1
          ? 'RELANCES.HEADER_META_JOUR'
          : 'RELANCES.HEADER_META';
    return this.translate.instant(
      cle,
      {
        facture: this.facture()?.numeroFacture ?? '—',
        solde: formatFcfa(this.soldeRestant()),
        jours: this.retardJours(),
      },
      lang,
    );
  });

  readonly paiementLabel = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant(
      'RELANCES.BTN_PAIEMENT',
      { solde: formatFcfa(this.soldeRestant()) },
      lang,
    );
  });

  readonly steps = computed((): StepVm[] => {
    const lang = this.translate.currentLang() ?? undefined;
    const etape = this.etapeActuelle();
    const dateDepassement = this.suivi()?.dateDepassement ?? null;
    const params = {
      abonne: this.greeting(),
      montant: formatFcfa(this.facture()?.montant ?? this.solde()?.montantTotal ?? 0),
      mois: this.moisLabel(),
    };

    return STAGES.map((stage) => {
      const done = stage.numero <= etape;
      const date = this.addJours(dateDepassement, stage.offsetJours);
      const isSuspension = stage.numero === 4;
      return {
        numero: stage.numero,
        done,
        isSuspension,
        toneClass: done ? `tone--${stage.numero}` : 'tone--upcoming',
        title: this.translate.instant(stage.titleKey, {}, lang),
        message: this.translate.instant(stage.msgKey, params, lang),
        dateLabel: done ? this.formatDateHeure(date) : this.formatDateCourte(date),
        dateIso: date ? date.toISOString().slice(0, 10) : null,
        deliveredLabel: done ? this.translate.instant('RELANCES.DELIVERED', {}, lang) : null,
        scheduledLabel: done ? null : this.translate.instant('RELANCES.SCHEDULED', {}, lang),
        adminBadge:
          done && stage.numero === 3
            ? this.translate.instant('RELANCES.ADMIN_NOTIFIED', { admin: this.adminUsername() }, lang)
            : null,
        suspensionBadge:
          done && stage.numero === 4
            ? this.translate.instant('RELANCES.SUSPENSION_AUTO', {}, lang)
            : null,
      };
    });
  });

  /** Aperçu du message qui sera renvoyé (dernier stage franchi). Best-effort :
   *  le backend peut recomposer le message avec des variables plus récentes ;
   *  cette preview est fidèle à l'affichage timeline courant. */
  readonly renvoiPreviewMessage = computed(() => {
    const done = this.steps().filter((s) => s.done);
    return done.length > 0 ? done[done.length - 1].message : '';
  });

  readonly renvoiPreviewTitle = computed(() => {
    const done = this.steps().filter((s) => s.done);
    return done.length > 0 ? done[done.length - 1].title : '';
  });

  /** Libellé du bouton d'action : soit "Renvoyer", soit "Attendre Ns" pendant cooldown. */
  readonly renvoiButtonLabel = computed(() => {
    const cd = this.renvoiCooldown();
    if (cd > 0) {
      const lang = this.translate.currentLang() ?? undefined;
      return this.translate.instant('RELANCES.COOLDOWN', { seconds: cd }, lang);
    }
    return this.translate.instant('RELANCES.BTN_RENVOYER');
  });

  ngOnInit(): void {
    const factureId = this.route.snapshot.params['factureId'] as string;
    void this.load(factureId);
  }

  async load(factureId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [facture, solde, suivi] = await Promise.all([
        this.facturesService.getFacture(factureId),
        this.facturesService.getSoldeFacture(factureId),
        this.facturesService.getSuiviImpaye(factureId).catch(() => null),
      ]);
      this.facture.set(facture);
      this.solde.set(solde);
      this.suivi.set(suivi);

      const abonneId = suivi?.abonneId ?? facture.abonneId;
      const tasks: Promise<unknown>[] = [];
      if (abonneId) {
        tasks.push(
          this.abonnesService.getAbonne(abonneId).then((a) => this.abonne.set(a)).catch(() => undefined),
        );
      }
      if (facture.campagneId) {
        tasks.push(
          this.campagnesService
            .getCampagne(facture.campagneId)
            .then((c) => this.campagne.set(c))
            .catch(() => undefined),
        );
      }
      await Promise.allSettled(tasks);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('RELANCES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  reload(): void {
    const factureId = this.route.snapshot.params['factureId'] as string;
    void this.load(factureId);
  }

  enregistrerPaiement(): void {
    const f = this.facture();
    if (!f) return;
    void this.router.navigate(['/factures', f.factureId], { queryParams: { paiement: 1 } });
  }

  /** Ouvre la sheet de confirmation. Refuse si envoi en cours ou cooldown actif. */
  openConfirmRenvoi(): void {
    if (this.renvoi() || this.renvoiCooldown() > 0) return;
    this.renvoiConfirmOpen.set(true);
  }

  cancelConfirmRenvoi(): void {
    if (this.renvoi()) return; // pas d'annulation en plein envoi
    this.renvoiConfirmOpen.set(false);
  }

  /** Envoie effectivement le message. Ferme la sheet, arme le cooldown. */
  async confirmRenvoi(): Promise<void> {
    const f = this.facture();
    if (!f || this.renvoi()) return;
    this.renvoi.set(true);
    try {
      await this.facturesService.renvoyerFactureWhatsapp(f.factureId);
      this.toast.success(this.translate.instant('RELANCES.SUCCESS_RENVOI'));
      this.renvoiConfirmOpen.set(false);
      this.startCooldown();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.renvoi.set(false);
    }
  }

  private startCooldown(): void {
    this.renvoiCooldown.set(RENVOI_COOLDOWN_SECONDS);
    const tick = (): void => {
      const remaining = this.renvoiCooldown() - 1;
      this.renvoiCooldown.set(Math.max(0, remaining));
      if (remaining > 0) setTimeout(tick, 1000);
    };
    setTimeout(tick, 1000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private greeting(): string {
    const a = this.abonne();
    if (!a) return '';
    return `${a.prenom} ${a.nom.toUpperCase()}`.trim();
  }

  private adminUsername(): string {
    // À défaut d'un champ dédié côté suivi, libellé générique du destinataire.
    return this.translate.instant('RELANCES.ADMIN_GENERIC');
  }

  private moisLabel(): string {
    const c = this.campagne();
    if (!c) return '';
    const lang = this.translate.currentLang() ?? 'fr';
    return formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang).split(' ')[0];
  }

  private addJours(dateStr: string | null, jours: number): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + jours);
    return d;
  }

  private joursDepuis(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  }

  private formatDateCourte(d: Date | null): string {
    if (!d) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  private formatDateHeure(d: Date | null): string {
    if (!d) return '—';
    return `${this.formatDateCourte(d)} · 08h00`;
  }
}
