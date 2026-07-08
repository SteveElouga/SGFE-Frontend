import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from '@angular/core';
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
  /** Valeur du champ de recherche. */
  readonly search = input('');
  readonly searchChange = output<string>();
  /** Clé i18n du placeholder de recherche. */
  readonly searchPlaceholder = input('COMMON.SEARCH');
  /** Afficher le champ de recherche (false pour les listes sans recherche). */
  readonly showSearch = input(true);
}
