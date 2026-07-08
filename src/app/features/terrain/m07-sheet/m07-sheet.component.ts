import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

export type M07Statut = 'NON_RELEVE' | 'ESTIME';

export interface M07Result {
  statut: M07Statut;
  observation: string;
}

/**
 * Bottom-sheet « marquer non relevé / estimé » (M-07) de l'interface agent
 * terrain. Auto-contenu : gère le choix du statut + l'observation obligatoire,
 * puis émet `(confirm)` avec le résultat ; le parent applique la logique métier
 * (mise en file hors-ligne, toast, retour à la liste). Piloté par `[open]`.
 */
@Component({
  selector: 'app-m07-sheet',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './m07-sheet.component.html',
  styleUrl: './m07-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class M07SheetComponent {
  readonly open = input(false);
  readonly cancel = output<void>();
  readonly confirm = output<M07Result>();

  readonly statut = signal<M07Statut>('NON_RELEVE');
  readonly observation = signal('');
  readonly valide = computed(() => this.observation().trim().length > 0);

  constructor() {
    // Réinitialise le formulaire à chaque ouverture.
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) {
        this.statut.set('NON_RELEVE');
        this.observation.set('');
      }
      wasOpen = isOpen;
    });
  }

  setStatut(statut: M07Statut): void {
    this.statut.set(statut);
  }

  onConfirm(): void {
    if (!this.valide()) return;
    this.confirm.emit({ statut: this.statut(), observation: this.observation().trim() });
  }
}
