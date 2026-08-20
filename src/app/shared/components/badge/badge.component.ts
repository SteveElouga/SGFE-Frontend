import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Teinte sémantique d'une puce de statut. */
export type BadgeTone = 'success' | 'info' | 'danger' | 'warning' | 'neutral';

/** Taille visuelle : `md` par défaut (list/tables), `lg` pour héro (statut dominant). */
export type BadgeSize = 'md' | 'lg';

/**
 * Puce de statut générique et présentationnelle : le parent fournit le libellé
 * (déjà traduit) et la teinte sémantique. La palette est centralisée ici → une
 * seule source de vérité pour toutes les puces de statut de l'app (factures,
 * campagnes, relevés, paiements…). Le mapping statut → teinte vit à côté de
 * chaque domaine (`factureStatutTone`, `campagneStatutTone`, `releveStatutTone`).
 *
 * ```html
 * <app-badge [label]="'FACTURATION.STATUT.' + f.statut | translate"
 *            [tone]="factureStatutTone(f.statut)" />
 * ```
 */
@Component({
  selector: 'app-badge',
  standalone: true,
  template: `<span class="badge badge--{{ tone() }} badge--{{ size() }}">{{ label() }}</span>`,
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  /** Libellé affiché (déjà traduit). */
  readonly label = input.required<string>();
  /** Teinte sémantique (couleur). */
  readonly tone = input<BadgeTone>('neutral');
  /** Taille visuelle : `md` défaut, `lg` pour héro (statut dominant). */
  readonly size = input<BadgeSize>('md');
}
