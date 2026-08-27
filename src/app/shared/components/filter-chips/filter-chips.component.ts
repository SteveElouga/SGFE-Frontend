import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface FilterChip {
  /** Libellé déjà résolu (ou clé i18n si `translateLabels` = true). */
  label: string;
  /** Valeur émise à la sélection. */
  value: string;
  /** Compteur optionnel affiché entre parenthèses. */
  count?: number;
}

/**
 * Contrôle segmenté (pilules) pour filtrer par une valeur unique — pensé
 * mobile-first : recherche au-dessus, chips en dessous (cf. maquette abonnés).
 * Inclut une pilule « Tous » en tête (valeur `null`).
 *
 * ```html
 * <app-filter-chips
 *   [options]="statutChips()"
 *   [total]="abonnes().length"
 *   [value]="statutFilter()"
 *   (valueChange)="onStatutChip($event)" />
 * ```
 */
@Component({
  selector: 'app-filter-chips',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fchips-groupe">
      @if (groupLabel()) {
        <span class="fchips__legende" [id]="legendeId">{{ groupLabel()! | translate }}</span>
      }
      <div
        class="fchips"
        role="tablist"
        [attr.aria-labelledby]="groupLabel() ? legendeId : null"
        [attr.aria-label]="groupLabel() ? null : (allLabel() | translate)"
      >
      <button
        type="button"
        class="fchips__chip"
        [class.fchips__chip--active]="value() === null"
        role="tab"
        [attr.aria-selected]="value() === null"
        (click)="valueChange.emit(null)"
      >
        {{ allLabel() | translate }}
        @if (total() !== null) {
          <span class="fchips__count">({{ total() }})</span>
        }
      </button>

      @for (opt of options(); track opt.value) {
        <button
          type="button"
          class="fchips__chip"
          [class.fchips__chip--active]="value() === opt.value"
          role="tab"
          [attr.aria-selected]="value() === opt.value"
          (click)="valueChange.emit(opt.value)"
        >
          {{ translateLabels() ? (opt.label | translate) : opt.label }}
          @if (opt.count !== undefined) {
            <span class="fchips__count">({{ opt.count }})</span>
          }
        </button>
      }
      </div>
    </div>
  `,
  styleUrl: './filter-chips.component.scss',
})
export class FilterChipsComponent {
  /** Options (hors « Tous », ajouté automatiquement en tête). */
  readonly options = input<FilterChip[]>([]);
  /** Valeur sélectionnée (`null` = « Tous »). */
  readonly value = input<string | null>(null);
  /** Compteur de la pilule « Tous » (`null` pour le masquer). */
  readonly total = input<number | null>(null);
  /**
   * Nom du groupe de filtres — clé de traduction.
   *
   * Sans lui, deux rangées de chips empilées sont indiscernables : sur
   * `/utilisateurs`, l'une filtre le rôle et l'autre le statut, et toutes deux
   * s'ouvraient sur une pastille « Tous » identique. Rien ne le disait, ni à
   * l'œil, ni au lecteur d'écran — le `role="tablist"` n'avait aucun nom
   * accessible.
   *
   * L'étiquette est rendue visible ET rattachée au groupe par
   * `aria-labelledby`. Elle reste facultative : un écran à une seule rangée
   * n'a rien à nommer.
   */
  readonly groupLabel = input<string | null>(null);

  /** Identifiant stable pour lier l'étiquette au groupe. */
  private static compteur = 0;
  protected readonly legendeId = `fchips-${(FilterChipsComponent.compteur += 1)}`;
  /** Clé i18n du libellé « Tous ». */
  readonly allLabel = input('COMMON.ALL');
  /** Traiter `opt.label` comme des clés i18n. */
  readonly translateLabels = input(false);

  readonly valueChange = output<string | null>();
}
