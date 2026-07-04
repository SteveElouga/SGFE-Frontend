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
import { ToastService } from '../../../shared/services/toast.service';

/** Délais par défaut des relances graduées (configurables dans Paramètres). */
const STAGES = [
  { numero: 1, offsetJours: 0, titleKey: 'RELANCES.STAGE1.TITLE', msgKey: 'RELANCES.STAGE1.MSG' },
  { numero: 2, offsetJours: 3, titleKey: 'RELANCES.STAGE2.TITLE', msgKey: 'RELANCES.STAGE2.MSG' },
  { numero: 3, offsetJours: 7, titleKey: 'RELANCES.STAGE3.TITLE', msgKey: 'RELANCES.STAGE3.MSG' },
  { numero: 4, offsetJours: 10, titleKey: 'RELANCES.STAGE4.TITLE', msgKey: 'RELANCES.STAGE4.MSG' },
] as const;

interface StepVm {
  numero: number;
  done: boolean;
  isSuspension: boolean;
  toneClass: string;
  title: string;
  message: string;
  dateLabel: string;
  deliveredLabel: string | null;
  scheduledLabel: string | null;
  adminBadge: string | null;
  suspensionBadge: string | null;
}

@Component({
  imports: [TranslatePipe, ErrorBannerComponent, PageTopbarComponent],
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

  readonly retardJours = computed(() => this.joursDepuis(this.suivi()?.dateDepassement ?? null) ?? 0);

  readonly resolu = computed(() => !!this.suivi()?.resoluLe);

  readonly breadcrumb = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('RELANCES.BREADCRUMB', { nom: this.abonneNom() }, lang);
  });

  readonly headerMeta = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant(
      'RELANCES.HEADER_META',
      {
        facture: this.facture()?.numeroFacture ?? '—',
        solde: this.formatFCFA(this.soldeRestant()),
        jours: this.retardJours(),
      },
      lang,
    );
  });

  readonly paiementLabel = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant(
      'RELANCES.BTN_PAIEMENT',
      { solde: this.formatFCFA(this.soldeRestant()) },
      lang,
    );
  });

  readonly steps = computed((): StepVm[] => {
    const lang = this.translate.currentLang() ?? undefined;
    const etape = this.etapeActuelle();
    const dateDepassement = this.suivi()?.dateDepassement ?? null;
    const params = {
      abonne: this.greeting(),
      montant: this.formatFCFA(this.facture()?.montant ?? this.solde()?.montantTotal ?? 0),
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

  async renvoyerDernier(): Promise<void> {
    const f = this.facture();
    if (!f || this.renvoi()) return;
    this.renvoi.set(true);
    try {
      await this.facturesService.renvoyerFactureWhatsapp(f.factureId);
      this.toast.success(this.translate.instant('RELANCES.SUCCESS_RENVOI'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.renvoi.set(false);
    }
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

  formatFCFA(n: number): string {
    return `${n.toLocaleString('fr-FR')} FCFA`;
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
