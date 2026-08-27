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
import { FacturesService } from '../../../core/factures/factures.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { ModePaiement, SoldeFacture } from '../../models/facture.model';
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../services/toast.service';
import { formatFcfa } from '../../pipes/fcfa.pipe';

/** Une part du versement, telle qu'elle sera imputée. */
export interface PartImputee {
  factureId: string;
  numeroFacture: string;
  part: number;
  joursDeRetard: number;
}

/**
 * Encaissement au nom d'un abonné, avec prévisualisation de la ventilation.
 *
 * Le geste courant n'est pas « payer cette facture » : un abonné qui tend de
 * l'argent paie sa dette. Lui demander de choisir une facture, c'est demander
 * au caissier de trancher une question comptable qu'il n'a pas à trancher — et
 * qu'il tranchera mal, parce que la facture la plus visible à l'écran est la
 * plus récente. Solder la facture du mois en laissant vieillir l'arriéré ne
 * produit aucune erreur : ça produit une suspension, trois semaines plus tard,
 * chez quelqu'un qui a payé.
 *
 * L'imputation va donc du plus ancien au plus récent, automatiquement. Mais
 * elle **montre ce qu'elle va faire** avant de valider : l'automatisme évite au
 * caissier de décider, il ne doit pas lui cacher la décision. Et il apprend la
 * règle en la voyant s'appliquer.
 *
 * `enregistrerPaiement` (une facture nommée) reste accessible ailleurs, pour
 * les cas où l'imputation doit être forcée.
 */
@Component({
  selector: 'app-encaissement-sheet',
  imports: [FormsModule, TranslatePipe, BottomSheetComponent],
  templateUrl: './encaissement-sheet.component.html',
  styleUrl: './encaissement-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncaissementSheetComponent {
  readonly open = input(false);
  readonly abonneId = input.required<string>();
  readonly abonneNom = input('');
  /** Soldes non éteints de cet abonné — source de la prévisualisation. */
  readonly soldes = input<readonly SoldeFacture[]>([]);
  /** Numéro de facture par identifiant, pour nommer les parts lisiblement. */
  readonly numerosParFacture = input<Record<string, string>>({});

  readonly close = output<void>();
  readonly saved = output<void>();

  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly montant = signal<number | null>(null);
  readonly mode = signal<ModePaiement>('ESPECES');
  readonly reference = signal('');
  readonly submitting = signal(false);

  readonly modeOptions: ReadonlyArray<{ value: ModePaiement; cle: string }> = [
    { value: 'ESPECES', cle: 'FACTURATION.MODE.ESPECES' },
    { value: 'MOBILE_MONEY', cle: 'FACTURATION.MODE.MOBILE_MONEY' },
    { value: 'VIREMENT', cle: 'FACTURATION.MODE.VIREMENT' },
  ];

  /** La référence n'a de sens que pour une transaction tracée. */
  readonly referenceRequise = computed(
    () => this.mode() === 'MOBILE_MONEY' || this.mode() === 'VIREMENT',
  );

  readonly totalDu = computed(() =>
    this.soldes().reduce((acc, s) => acc + (s.soldeRestant ?? 0), 0),
  );

  readonly totalDuFormate = computed(() => formatFcfa(this.totalDu()));

  /**
   * Ce que le versement va faire, avant de le faire.
   *
   * Rejoue la règle du backend — le solde le plus anciennement exigible
   * d'abord. Si les deux divergeaient un jour, c'est ici qu'on le verrait :
   * la ventilation annoncée ne correspondrait pas à celle enregistrée.
   */
  readonly imputation = computed<PartImputee[]>(() => {
    const m = this.montant();
    if (m === null || m <= 0) return [];
    const numeros = this.numerosParFacture();
    const aujourdhui = Date.now();
    return this.facturesService
      .previsualiserImputation(
        m,
        this.soldes().map((s) => ({
          factureId: s.factureId,
          numeroFacture: numeros[s.factureId] ?? s.factureId.slice(0, 8),
          soldeRestant: s.soldeRestant,
          dateLimitePaiement: s.dateLimitePaiement,
        })),
      )
      .map((p) => ({
        factureId: p.factureId,
        numeroFacture: p.numeroFacture,
        part: p.part,
        joursDeRetard: Math.max(
          0,
          Math.floor((aujourdhui - new Date(p.dateLimitePaiement).getTime()) / 86_400_000),
        ),
      }));
  });

  /** Ce qui dépasse la dette part au crédit de l'abonné. */
  readonly excedent = computed(() => {
    const m = this.montant() ?? 0;
    const impute = this.imputation().reduce((acc, p) => acc + p.part, 0);
    return Math.max(0, m - impute);
  });

  readonly montantValide = computed(() => (this.montant() ?? 0) > 0);
  readonly referenceValide = computed(
    () => !this.referenceRequise() || this.reference().trim().length > 0,
  );
  readonly formValide = computed(() => this.montantValide() && this.referenceValide());

  formater(n: number): string {
    return formatFcfa(n);
  }

  async submit(): Promise<void> {
    if (!this.formValide() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const res = await this.facturesService.enregistrerPaiementAbonne({
        abonneId: this.abonneId(),
        montant: this.montant()!,
        datePaiement: new Date().toISOString().slice(0, 10),
        modePaiement: this.mode(),
        referenceTransaction: this.reference().trim(),
      });
      const cle =
        res.paiements.length > 1
          ? 'PAIEMENTS.ENCAISSEMENT.SUCCES_MULTIPLE'
          : 'PAIEMENTS.ENCAISSEMENT.SUCCES';
      this.toast.success(this.translate.instant(cle, { n: res.paiements.length }));
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
    this.reference.set('');
    this.mode.set('ESPECES');
  }
}
