import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Barre de filtres partagée : conteneur unifié + champ de recherche intégré
 * (optionnel). Le reste des contrôles (selects, datepicker, boutons) est
 * **projeté** via `<ng-content>` — trop hétérogène pour être piloté par config
 * (mêmes raisons que les cellules custom de `app-data-table`).
 *
 * ```html
 * <app-filter-bar [search]="searchTerm()" (searchChange)="searchTerm.set($event)"
 *                 searchPlaceholder="ABONNES.SEARCH_PLACEHOLDER">
 *   <p-select … />
 * </app-filter-bar>
 * ```
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, IconFieldModule, InputIconModule, InputTextModule, TranslatePipe],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None : permet de mettre les contrôles PROJETÉS (p-select,
  // boutons) en pleine largeur en mobile sans ::ng-deep (même approche que
  // page-topbar). Les sélecteurs restent préfixés .filter-bar (faible collision).
  encapsulation: ViewEncapsulation.None,
})
export class FilterBarComponent {
  /** Valeur du champ de recherche (synchro parent → composant). */
  readonly search = input('');
  readonly searchChange = output<string>();
  /** Clé i18n du placeholder de recherche. */
  readonly searchPlaceholder = input('COMMON.SEARCH');
  /** Afficher le champ de recherche (false pour les listes sans recherche). */
  readonly showSearch = input(true);
  /**
   * Debounce en ms sur `searchChange` : 0 = émission immédiate à chaque frappe
   * (défaut, non-régressif). >0 = attend le silence de N ms avant d'émettre —
   * évite de refiltrer une grande liste à chaque touche.
   */
  readonly debounceMs = input(0);

  private readonly destroyRef = inject(DestroyRef);
  /** Buffer local qui suit chaque frappe ; l'émission est différée si debounceMs > 0. */
  readonly localSearch = signal('');
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Synchro externe → interne (le parent peut piloter la valeur via `[search]`).
    effect(() => {
      const ext = this.search();
      untracked(() => {
        if (ext !== this.localSearch()) this.localSearch.set(ext);
      });
    });
    this.destroyRef.onDestroy(() => {
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
    });
  }

  onInput(value: string): void {
    this.localSearch.set(value);
    const delay = this.debounceMs();
    if (delay <= 0) {
      this.searchChange.emit(value);
      return;
    }
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.searchChange.emit(value);
    }, delay);
  }
}
