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
import { FacturesService } from '../../../../core/factures/factures.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { formatFcfa } from '../../../../shared/pipes/fcfa.pipe';
import { nomAbonne } from '../../../../shared/utils/abonne.utils';
import type { AbonneCible } from '../../../../graphql/vues';

/**
 * Saisie d'une dette antérieure à la mise en service.
 *
 * Certains abonnés devaient déjà de l'argent quand l'application est arrivée.
 * Ces arriérés n'avaient aucun moyen d'entrer dans le système : une facture ne
 * naissait que d'un relevé, à la clôture d'une campagne.
 *
 * Le geste crée une **facture de régularisation** — une vraie facture, qui
 * entre donc dans les impayés, l'escalade des relances, le PDF et l'espace
 * abonné comme n'importe quelle autre. Elle s'en distingue par sa série de
 * numérotation (`REG-`) et par l'absence de relevé.
 *
 * Deux garde-fous, parce que ce geste crée une dette là où il n'y en avait pas :
 * le motif est obligatoire — c'est la seule justification d'un montant déclaré —
 * et un récapitulatif montre ce qui va être créé avant de valider.
 */
@Component({
  selector: 'app-arriere-sheet',
  imports: [FormsModule, TranslatePipe, BottomSheetComponent],
  templateUrl: './arriere-sheet.component.html',
  styleUrl: './arriere-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArriereSheetComponent {
  readonly open = input(false);
  readonly abonne = input<AbonneCible | null>(null);
  readonly close = output<void>();
  /** Émis après création — le parent recharge sa dette et ses factures. */
  readonly saved = output<void>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly montant = signal<number | null>(null);
  readonly motif = signal('');
  readonly submitting = signal(false);

  readonly nomComplet = computed(() => {
    const a = this.abonne();
    return a ? nomAbonne(a.prenom, a.nom) : '';
  });

  readonly montantValide = computed(() => {
    const m = this.montant();
    return m !== null && m > 0;
  });

  readonly motifValide = computed(() => this.motif().trim().length >= 3);

  readonly formValide = computed(() => this.montantValide() && this.motifValide());

  /** Récapitulatif de ce qui sera créé — on ne crée pas une dette à l'aveugle. */
  readonly recap = computed(() => {
    if (!this.montantValide()) return null;
    return formatFcfa(this.montant()!);
  });

  async submit(): Promise<void> {
    const a = this.abonne();
    if (!a || !this.formValide() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const facture = await this.facturesService.creerRegularisation({
        abonneId: a.id,
        montant: this.montant()!,
        motif: this.motif().trim(),
      });
      this.toast.success(
        this.translate.instant('ABONNES.ARRIERE.SUCCES', { numero: facture.numeroFacture }),
      );
      this.reset();
      this.saved.emit();
      this.close.emit();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.submitting.set(false);
    }
  }

  onClose(): void {
    this.reset();
    this.close.emit();
  }

  private reset(): void {
    this.montant.set(null);
    this.motif.set('');
  }
}
