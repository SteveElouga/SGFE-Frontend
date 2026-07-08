import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

/**
 * Barre de titre standard des pages (54px fixes) : titre + sous-titre optionnel,
 * fil d'ariane retour optionnel, cloche de notifications à droite, et zone
 * d'actions **projetée** (`<ng-content>` — ex. bouton « + Nouveau »).
 *
 * `ViewEncapsulation.None` afin que les actions projetées héritent de la classe
 * utilitaire `.page-topbar-action` sans `::ng-deep`.
 *
 * ```html
 * <app-page-topbar [title]="'ABONNES.TITLE' | translate" [subtitle]="summary()">
 *   <a class="page-topbar-action" routerLink="new">…</a>
 * </app-page-topbar>
 * ```
 */
@Component({
  selector: 'app-page-topbar',
  standalone: true,
  imports: [RouterLink, NotificationBellComponent],
  template: `
    <header class="page-topbar">
      <div class="page-topbar__left">
        @if (backLink()) {
          <a class="page-topbar__back" [routerLink]="backLink()">← {{ backLabel() }}</a>
          <span class="page-topbar__sep">/</span>
        }
        <span class="page-topbar__title">{{ title() }}</span>
        @if (subtitle()) {
          <span class="page-topbar__subtitle">{{ subtitle() }}</span>
        }
      </div>
      <div class="page-topbar__right">
        <ng-content />
        @if (showBell()) {
          <app-notification-bell />
        }
      </div>
    </header>
  `,
  styleUrl: './page-topbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None pour que .page-topbar-action (projeté depuis le parent)
  // hérite des styles définis dans ce composant sans ::ng-deep
  encapsulation: ViewEncapsulation.None,
})
export class PageTopbarComponent {
  title = input.required<string>();
  subtitle = input<string>('');
  backLink = input<string>('');
  backLabel = input<string>('');
  /** Afficher la cloche de notifications (false sur la page Notifications elle-même). */
  showBell = input(true);
}
