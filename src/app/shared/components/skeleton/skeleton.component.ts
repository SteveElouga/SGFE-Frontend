import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bloc de chargement « shimmer » réutilisable. Dimensions paramétrables ;
 * on compose plusieurs blocs (dans le layout propre à l'écran) pour esquisser
 * la forme du contenu à venir. Centralise l'animation et la teinte → plus de
 * `@keyframes shimmer` dupliqué par écran.
 *
 * ```html
 * <app-skeleton height="88px" radius="14px" />
 * ```
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: '',
  styleUrl: './skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'aq-skeleton',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.borderRadius]': 'radius()',
  },
})
export class SkeletonComponent {
  /** Largeur CSS (défaut : pleine largeur). */
  readonly width = input('100%');
  /** Hauteur CSS. */
  readonly height = input('16px');
  /** Rayon des coins. */
  readonly radius = input('8px');
}
