import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { PlurielPipe } from '../../../../shared/pipes/pluriel.pipe';
import { Tarif } from '../../../../shared/models/facture.model';
import { ResumeCloture } from '../../../../shared/models/campagne.model';

/** Compteurs bruts issus de `relevesByStatut` (parent) — repli quand
 *  `resumeCloture` (backend autoritatif) n'a pas encore chargé. */
interface RelevesByStatutCounts {
  releve: number;
  estime: number;
  nonReleve: number;
  aRelever: number;
}

/**
 * Modale de clôture d'une campagne (écran 18) — extraite de
 * `CampagneDetailComponent` (613 → sous 400 lignes), même bottom-sheet et
 * mêmes calculs, désormais autonome.
 *
 * Le geste de clôture lui-même (mutation + spinner + erreur) est local à la
 * modale : rien d'autre n'en dépend tant qu'elle est ouverte. Le succès en
 * revanche modifie des données possédées par le parent (`campagne`,
 * `progression`, `releves`) — il est donc seulement **signalé** via `saved`,
 * et c'est le parent qui recharge et affiche le toast de succès, exactement
 * dans l'ordre d'origine (fermeture → rechargement → toast).
 */
@Component({
  selector: 'app-cloture-modal',
  imports: [FormsModule, DecimalPipe, TranslatePipe, PlurielPipe, BottomSheetComponent],
  templateUrl: './cloture-modal.component.html',
  styleUrl: './cloture-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClotureModalComponent {
  private readonly service = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly open = input(false);
  readonly campagneId = input<string>('');
  /** Libellé de la période affiché dans le titre et la case à cocher. */
  readonly periode = input<string>('');
  readonly envoyerWhatsappAuto = input<boolean | null | undefined>(false);
  /** Aperçu du tarif courant (préchargé par le parent au chargement de la page). */
  readonly tarifActuel = input<Tarif | null>(null);
  /** Ventilation autoritative (chargée par le parent à l'ouverture de la modale). */
  readonly resumeCloture = input<ResumeCloture | null>(null);
  /** Repli heuristique si `resumeCloture` est absent. */
  readonly relevesByStatut = input<RelevesByStatutCounts>({
    releve: 0,
    estime: 0,
    nonReleve: 0,
    aRelever: 0,
  });

  readonly close = output<void>();
  /** Émis après clôture réussie — le parent recharge et affiche le succès. */
  readonly saved = output<void>();

  readonly clotureConfirme = signal(false);
  readonly cloturant = signal(false);

  constructor() {
    // Rouvrir la modale doit toujours repartir case décochée — même
    // comportement que l'ancien `openClotureModal()` du parent (qui faisait
    // `this.clotureConfirme.set(false)` avant `clotureModalVisible.set(true)`).
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) this.clotureConfirme.set(false);
      wasOpen = isOpen;
    });
  }

  readonly clotureStats = computed(() => {
    const r = this.resumeCloture();
    if (r) {
      return {
        releve: r.nbReleves,
        estime: r.nbEstimes,
        nonReleve: r.nbNonReleves,
        aRelever: r.nbRestants,
        facturesAGenerer: r.nbFacturesAGenerer,
      };
    }
    const h = this.relevesByStatut();
    return {
      releve: h.releve,
      estime: h.estime,
      nonReleve: h.nonReleve,
      aRelever: h.aRelever,
      facturesAGenerer: h.releve + h.estime,
    };
  });

  readonly facturesAGenerer = computed(() => this.clotureStats().facturesAGenerer);
  readonly sansReleve = computed(() => {
    const s = this.clotureStats();
    return s.aRelever + s.nonReleve;
  });

  async cloturer(): Promise<void> {
    if (this.cloturant() || !this.clotureConfirme()) return;
    this.cloturant.set(true);
    try {
      await this.service.cloturerCampagne(this.campagneId());
      this.saved.emit();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.cloturant.set(false);
    }
  }
}
