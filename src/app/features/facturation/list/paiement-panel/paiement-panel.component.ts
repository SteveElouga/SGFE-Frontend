import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FacturesService } from '../../../../core/factures/factures.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { Facture, ModePaiement } from '../../../../shared/models/facture.model';
import { FcfaPipe } from '../../../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * Panneau de saisie d'un paiement, affiché inline sous la liste des factures.
 * Auto-contenu : charge le solde à l'ouverture, valide la saisie, enregistre le
 * paiement et émet `(saved)` ; le parent recharge alors la liste. Piloté par
 * l'entrée `[facture]` (null = panneau fermé).
 */
@Component({
  selector: 'app-paiement-panel',
  imports: [FormsModule, InputTextModule, SelectModule, TranslatePipe, FcfaPipe],
  templateUrl: './paiement-panel.component.html',
  styleUrl: './paiement-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementPanelComponent {
  readonly facture = input<Facture | null>(null);
  readonly close = output<void>();
  readonly saved = output<void>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly panelSolde = signal<number | null>(null);
  readonly panelLoading = signal(false);
  readonly submitting = signal(false);

  readonly pMontant = signal('');
  readonly pMode = signal<ModePaiement>('ESPECES');
  readonly pDate = signal('');
  readonly pRef = signal('');

  readonly modeOptions = computed((): Array<{ label: string; value: ModePaiement }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('FACTURATION.MODE.ESPECES', {}, lang), value: 'ESPECES' },
      { label: this.translate.instant('FACTURATION.MODE.MOBILE_MONEY', {}, lang), value: 'MOBILE_MONEY' },
      { label: this.translate.instant('FACTURATION.MODE.CHEQUE', {}, lang), value: 'CHEQUE' },
      { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' },
    ];
  });

  readonly refRequired = computed(
    () => this.pMode() === 'MOBILE_MONEY' || this.pMode() === 'VIREMENT',
  );

  readonly soldeRestant = computed(() => this.panelSolde() ?? 0);

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

  constructor() {
    // Charge le solde + réinitialise le formulaire à chaque nouvelle facture.
    let currentId: string | null = null;
    effect(() => {
      const f = this.facture();
      if (f && f.factureId !== currentId) {
        currentId = f.factureId;
        this.loadSolde(f);
      } else if (!f) {
        currentId = null;
      }
    });
  }

  private loadSolde(f: Facture): void {
    this.pRef.set('');
    this.pMode.set('ESPECES');
    this.pDate.set(new Date().toISOString().split('T')[0]);
    this.panelSolde.set(null);
    this.panelLoading.set(true);
    void this.facturesService.getSoldeFacture(f.factureId).then((s) => {
      this.panelSolde.set(s.soldeRestant);
      this.pMontant.set(s.soldeRestant > 0 ? String(s.soldeRestant) : '');
      this.panelLoading.set(false);
    });
  }

  async submit(): Promise<void> {
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
      this.saved.emit();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.submitting.set(false);
    }
  }
}
