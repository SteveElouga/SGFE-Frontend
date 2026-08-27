import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { FacturesService } from '../../../core/factures/factures.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { Facture, ModePaiement } from '../../models/facture.model';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { ToastService } from '../../services/toast.service';

/**
 * Fenêtre d'annulation (Gmail-style Undo Send) : l'utilisateur clique
 * « Enregistrer », l'appel API est différé de 5s pendant lesquelles il peut
 * annuler via l'action du toast. Choix conscient d'un backend sans mutation
 * `annulerPaiement` : plus sûr d'attendre que d'écrire puis d'essayer d'effacer.
 */
const UNDO_WINDOW_MS = 5000;

/**
 * Formulaire de saisie d'un paiement, réutilisable partout où l'on encaisse un
 * règlement pour une facture donnée. Extrait du duplicata initial entre
 * `paiement-panel` (facturation-list) et `facture-detail` (batch 7 facturation) :
 * une seule source de vérité pour la validation, l'a11y (`aria-invalid`,
 * `aria-required`, `role="alert"`, `inputmode`, `autocomplete`), et le call
 * `enregistrerPaiement`.
 *
 * Le parent contrôle **quand** monter le composant (facture nulle = pas de
 * formulaire) et **quoi faire** après enregistrement (`saved` output : recharge
 * la liste, ferme le panneau, affiche un toast, etc.).
 */
@Component({
  selector: 'app-paiement-form',
  standalone: true,
  imports: [FormsModule, InputTextModule, SelectModule, TranslatePipe, TooltipDirective],
  templateUrl: './paiement-form.component.html',
  styleUrl: './paiement-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementFormComponent {
  /** Facture ciblée. Le parent doit passer une facture valide quand il monte le composant. */
  readonly facture = input.required<Facture>();
  /** Solde restant à régler (loadé par le parent). Null pendant le chargement. */
  readonly soldeRestant = input<number | null>(null);
  /**
   * Préfixe des `id` des champs — indispensable quand plusieurs formulaires
   * cohabitent (ex. detail avec bottom-sheet + panel list ouvert simultanément).
   * Défaut `pf` compatible avec le SCSS partagé.
   */
  readonly idPrefix = input<string>('pf');

  /** Émis après enregistrement réussi. Le parent décide de la suite. */
  readonly saved = output<void>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pMontant = signal('');
  readonly pMode = signal<ModePaiement>('ESPECES');
  readonly pDate = signal('');
  readonly pRef = signal('');
  /** Vrai pendant la fenêtre d'annulation (5s) ET pendant l'appel API. */
  readonly submitting = signal(false);

  /** Timer d'annulation en cours (null = pas de submit en attente). */
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingToastId: string | null = null;

  readonly modeOptions = computed((): Array<{ label: string; value: ModePaiement }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('FACTURATION.MODE.ESPECES', {}, lang), value: 'ESPECES' },
      { label: this.translate.instant('FACTURATION.MODE.MOBILE_MONEY', {}, lang), value: 'MOBILE_MONEY' },
      { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' },
    ];
  });

  readonly refRequired = computed(
    () => this.pMode() === 'MOBILE_MONEY' || this.pMode() === 'VIREMENT',
  );

  readonly effectiveSolde = computed(() => this.soldeRestant() ?? 0);

  readonly montantExceedsSolde = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    return !Number.isNaN(montant) && montant > this.effectiveSolde();
  });

  readonly formValid = computed(() => {
    const montant = Number.parseFloat(this.pMontant());
    const refOk = !this.refRequired() || !!this.pRef().trim();
    return (
      !Number.isNaN(montant) &&
      montant > 0 &&
      montant <= this.effectiveSolde() &&
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

  /** Ids uniques : {prefix}-montant / -mode / -date / -ref / -montant-error. */
  readonly montantId = computed(() => `${this.idPrefix()}-montant`);
  readonly modeId = computed(() => `${this.idPrefix()}-mode`);
  readonly dateId = computed(() => `${this.idPrefix()}-date`);
  readonly refId = computed(() => `${this.idPrefix()}-ref`);
  readonly montantErrId = computed(() => `${this.idPrefix()}-montant-error`);

  constructor() {
    // Reset + prefill quand la facture ou le solde changent.
    let currentId: string | null = null;
    effect(() => {
      const f = this.facture();
      const solde = this.soldeRestant();
      if (f && f.factureId !== currentId) {
        currentId = f.factureId;
        this.cancelPending();                            // sécurité : facture change en cours d'undo
        this.pRef.set('');
        this.pMode.set('ESPECES');
        this.pDate.set(new Date().toISOString().split('T')[0]);
        this.pMontant.set(solde && solde > 0 ? String(solde) : '');
      } else if (f && solde !== null && solde > 0 && this.pMontant() === '') {
        // Solde arrivé après le mount (chargement async) : prefill si vide.
        this.pMontant.set(String(solde));
      }
    });

    // Cleanup : si le composant est détruit pendant la fenêtre d'annulation,
    // on annule le timer (paiement non enregistré) plutôt que de fire orphelin.
    this.destroyRef.onDestroy(() => this.cancelPending());
  }

  /**
   * Lance la fenêtre d'annulation : bouton grisé, toast avec action « Annuler ».
   * Après 5s → enregistrement effectif. Si l'utilisateur clique « Annuler »
   * → clearTimeout, form réhabilité, rien n'est envoyé au backend.
   */
  submit(): void {
    const f = this.facture();
    if (!this.formValid() || this.submitting()) return;
    this.submitting.set(true);
    const lang = this.translate.currentLang() ?? undefined;

    this.pendingToastId = this.toast.info(
      this.translate.instant('FACTURATION.PAIEMENT_UNDO_TITLE', {}, lang),
      this.translate.instant('FACTURATION.PAIEMENT_UNDO_MSG', {}, lang),
      [
        {
          label: this.translate.instant('FACTURATION.PAIEMENT_UNDO_ACTION', {}, lang),
          handler: () => this.cancelPending(true),
          variant: 'primary',
        },
      ],
    );

    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.pendingToastId = null;
      void this.actuallyEnregistrer(f);
    }, UNDO_WINDOW_MS);
  }

  /** Annule le timer d'undo. Si notify=true, affiche un toast « annulé ». */
  private cancelPending(notify = false): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.pendingToastId) {
      this.toast.dismiss(this.pendingToastId);
      this.pendingToastId = null;
    }
    this.submitting.set(false);
    if (notify) {
      this.toast.info(this.translate.instant('FACTURATION.PAIEMENT_UNDO_CANCELLED'));
    }
  }

  /** Appel API effectif après la fenêtre d'annulation. */
  private async actuallyEnregistrer(f: Facture): Promise<void> {
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
