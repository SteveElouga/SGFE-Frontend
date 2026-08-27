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
import { Envoi, Facture, SoldeFacture } from '../../../../shared/models/facture.model';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { formatFcfa } from '../../../../shared/pipes/fcfa.pipe';

/** Ce que le geste va faire : constater seulement, ou constater puis corriger. */
export type ModeAnnulation = 'annuler' | 'regenerer';

/**
 * Annulation d'une facture, avec ou sans régénération.
 *
 * Le geste efface une dette. C'est le plus lourd de l'application — plus lourd
 * que d'en créer une, parce qu'il retire quelque chose que quelqu'un devait, et
 * potentiellement quelque chose qu'on lui a déjà réclamé.
 *
 * Trois garde-fous, chacun pour une raison distincte.
 *
 * Le motif est obligatoire : aucun index ne justifie la disparition d'une
 * dette, la phrase saisie est la seule trace de la raison. C'est la même règle
 * que pour une régularisation, et pour la même cause.
 *
 * Un récapitulatif dit ce qui va se passer avant que ça se passe — en
 * particulier ce que devient l'argent déjà versé, qui est la question que se
 * pose immédiatement quiconque annule une facture partiellement payée.
 *
 * Un avertissement quand la facture est déjà partie chez l'abonné. Ce n'est pas
 * un blocage : une erreur d'index se découvre précisément après l'envoi, quand
 * le client conteste. Mais l'abonné garde alors dans WhatsApp une facture
 * périmée, et il faut le savoir pour lui envoyer la nouvelle.
 */
@Component({
  selector: 'app-annuler-sheet',
  imports: [FormsModule, TranslatePipe, BottomSheetComponent],
  templateUrl: './annuler-sheet.component.html',
  styleUrl: './annuler-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnulerSheetComponent {
  readonly open = input(false);
  readonly facture = input<Facture | null>(null);
  readonly solde = input<SoldeFacture | null>(null);
  /** Envois de cette facture — pour savoir si l'abonné l'a déjà reçue. */
  readonly envois = input<readonly Envoi[]>([]);

  readonly close = output<void>();
  /** Émis après annulation ; porte la facture de remplacement s'il y en a une. */
  readonly done = output<Facture | null>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly mode = signal<ModeAnnulation>('annuler');
  readonly motif = signal('');
  readonly submitting = signal(false);

  readonly motifValide = computed(() => this.motif().trim().length >= 3);

  /** Ce que l'abonné a déjà versé sur cette facture — il lui reviendra. */
  readonly dejaVerse = computed(() => this.solde()?.montantPaye ?? 0);
  readonly dejaVerseFormate = computed(() => formatFcfa(this.dejaVerse()));

  /**
   * La facture est-elle déjà partie chez l'abonné ?
   *
   * Seul un envoi réussi compte : un envoi en échec n'a rien mis entre ses
   * mains, et avertir pour une facture qui n'est jamais arrivée ferait douter
   * de l'avertissement le jour où il compte.
   */
  readonly dejaEnvoyee = computed(() => this.envois().some((e) => e.statut === 'ENVOYE'));

  /**
   * Une régularisation ne se régénère pas : son montant est déclaré, pas
   * calculé. Il n'y a rien à recalculer — on l'annule, et on en saisit une
   * autre si besoin.
   */
  readonly regenerationPossible = computed(() => {
    const f = this.facture();
    return !!f && f.nature !== 'REGULARISATION' && !!f.campagneId;
  });

  async submit(): Promise<void> {
    const f = this.facture();
    if (!f || !this.motifValide() || this.submitting()) return;
    this.submitting.set(true);
    try {
      if (this.mode() === 'regenerer') {
        const r = await this.facturesService.regenererFacture(f.factureId, this.motif().trim());
        this.toast.success(
          this.translate.instant('FACTURATION.ANNULATION.SUCCES_REGENERE', {
            ancien: r.annulee.numeroFacture,
            nouveau: r.nouvelle.numeroFacture,
          }),
        );
        this.reset();
        this.done.emit(r.nouvelle);
      } else {
        const annulee = await this.facturesService.annulerFacture(f.factureId, this.motif().trim());
        this.toast.success(
          this.translate.instant('FACTURATION.ANNULATION.SUCCES', {
            numero: annulee.numeroFacture,
          }),
        );
        this.reset();
        this.done.emit(null);
      }
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
    this.motif.set('');
    this.mode.set('annuler');
  }
}
