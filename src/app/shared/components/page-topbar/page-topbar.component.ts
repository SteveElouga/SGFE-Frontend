import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { LayoutService } from '../../services/layout.service';

/**
 * Barre de titre standard des pages : titre + sous-titre optionnel, surtitre
 * (`overline`) optionnel, fil d'ariane retour optionnel, cloche de
 * notifications à droite et zone d'actions **projetée** (`<ng-content>`).
 *
 * Mobile (≤ 768px, maquettes M-04/M-05) : fond navy, textes blancs, bouton
 * hamburger qui ouvre le tiroir de navigation ; la cloche n'apparaît que
 * lorsqu'il y a des notifications non lues.
 * L'`overline` s'affiche AU-DESSUS du titre (mobile) et à sa suite (desktop).
 * Un slot `[topbar-hero]` permet de projeter un bloc pleine largeur dans le
 * header navy (ex. progression de campagne du dashboard).
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
      <div class="page-topbar__row">
        <div class="page-topbar__left">
          @if (backLink()) {
            <a class="page-topbar__back" [routerLink]="backLink()" [attr.aria-label]="backLabel()">←<span class="page-topbar__back-label"> {{ backLabel() }}</span></a>
            <span class="page-topbar__sep">/</span>
          }
          <div class="page-topbar__titles">
            @if (overline()) {
              <span class="page-topbar__overline">{{ overline() }}</span>
            }
            <span class="page-topbar__title">{{ title() }}</span>
            @if (subtitle()) {
              <span class="page-topbar__subtitle">{{ subtitle() }}</span>
            }
          </div>
        </div>
        <div class="page-topbar__right">
          <ng-content />
          @if (showBell()) {
            <app-notification-bell
              class="page-topbar__bell"
              [class.page-topbar__bell--has-unread]="hasUnread()"
            />
          }
          <button
            type="button"
            class="page-topbar__menu"
            (click)="layout.openMenu()"
            aria-label="Ouvrir le menu"
          ><i class="pi pi-bars" aria-hidden="true"></i></button>
        </div>
      </div>
      <ng-content select="[topbar-hero]" />
    </header>
  `,
  styleUrl: './page-topbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None pour que .page-topbar-action (projeté depuis le parent)
  // hérite des styles définis dans ce composant sans ::ng-deep
  encapsulation: ViewEncapsulation.None,
})
export class PageTopbarComponent {
  protected readonly layout = inject(LayoutService);
  private readonly notifications = inject(NotificationsService);

  /** Pilote l'affichage mobile de la cloche (visible seulement si non-lues). */
  protected readonly hasUnread = computed(() => this.notifications.unreadCount() > 0);

  title = input.required<string>();
  subtitle = input<string>('');
  /** Surtitre (ex. campagne en cours) : au-dessus du titre en mobile, à sa suite en desktop. */
  overline = input<string>('');
  backLink = input<string>('');
  backLabel = input<string>('');
  /** Afficher la cloche de notifications (false sur la page Notifications elle-même). */
  showBell = input(true);
}
