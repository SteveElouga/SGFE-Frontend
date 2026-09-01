import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { FcfaPipe } from '../../../../shared/pipes/fcfa.pipe';
import type { PaiementFacture } from '../../../../graphql/vues';
import type { AnnulerPaiementMutation } from '../../../../graphql/generated';

/**
 * Annulation d'un paiement saisi par erreur.
 *
 * La mutation `annulerPaiement` existait depuis le début côté serveur —
 * implémentée, testée, réservée à ADMIN et COMPTABLE — et le frontend n'en
 * avait aucun document. Le formulaire de paiement portait même un commentaire
 * affirmant l'inverse, ce qui avait justifié une fenêtre d'annulation de cinq
 * secondes en guise de contournement. Cette feuille rend la capacité réelle
 * accessible, sans limite de temps.
 *
 * **Annulation douce.** Le paiement n'est pas supprimé : il reste en base,
 * marqué annulé avec qui, quand et pourquoi. Le solde de la facture est
 * rétabli et l'impayé réapparaît.
 *
 * **Il n'y a pas de modification, et c'est volontaire.** En comptabilité on ne
 * retouche pas une écriture enregistrée : on la contre-passe et on ressaisit.
 * L'interface le dit explicitement plutôt que de laisser chercher un bouton
 * « modifier » qui n'existera jamais.
 */
@Component({
  selector: 'app-annuler-paiement-sheet',
  standalone: true,
  imports: [FormsModule, TranslatePipe, BottomSheetComponent, FcfaPipe],
  templateUrl: './annuler-paiement-sheet.component.html',
  styleUrl: './annuler-paiement-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnulerPaiementSheetComponent {
  readonly open = input(false);
  readonly paiement = input<PaiementFacture | null>(null);

  readonly close = output<void>();
  /** Émet le paiement annulé — le parent recharge la facture et son solde. */
  readonly done = output<AnnulerPaiementMutation['annulerPaiement']>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly motif = signal('');
  readonly submitting = signal(false);

  /**
   * Trois caractères, comme pour l'annulation de facture : assez pour écarter
   * un « ok » ou un retour à la ligne, assez peu pour ne pas transformer une
   * correction de guichet en rédaction.
   */
  readonly motifValide = computed(() => this.motif().trim().length >= 3);

  onClose(): void {
    if (this.submitting()) return;
    this.motif.set('');
    this.close.emit();
  }

  async submit(): Promise<void> {
    const p = this.paiement();
    if (!p || !this.motifValide() || this.submitting()) return;

    this.submitting.set(true);
    try {
      const annule = await this.facturesService.annulerPaiement(
        p.paiementId,
        this.motif().trim(),
      );
      this.toast.success(this.translate.instant('FACTURATION.ANNUL_PAIEMENT.SUCCES'));
      this.motif.set('');
      this.done.emit(annule);
    } catch (err: unknown) {
      // Le backend refuse une seconde annulation avec un message explicite —
      // on le montre tel quel plutôt que de le remplacer par un générique.
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.submitting.set(false);
    }
  }
}
