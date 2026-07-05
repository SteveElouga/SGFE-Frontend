import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationsService } from '../../../core/notifications/notifications.service';

/**
 * Cloche + panneau déroulant de notifications (maquette « Notifications 1a »).
 * Autonome : à déposer dans n'importe quelle barre du haut via
 * `<app-notification-bell />`. Partage l'état avec la page complète et le badge
 * de la sidebar (NotificationsService, providedIn root).
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly service = inject(NotificationsService);

  private readonly bellBtn = viewChild<ElementRef<HTMLButtonElement>>('bellBtn');

  readonly open = signal(false);
  readonly tab = signal<'ALL' | 'UNREAD'>('ALL');

  readonly unreadCount = this.service.unreadCount;

  readonly recent = computed(() => {
    const all = this.service.notifications();
    const list = this.tab() === 'UNREAD' ? all.filter((n) => !n.read) : all;
    return list.slice(0, 5);
  });

  toggle(): void {
    if (this.open()) this.close();
    else this.open.set(true);
  }

  /** Ferme le panneau et rend le focus à la cloche (accessibilité). */
  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.bellBtn()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  markAllRead(): void {
    this.service.markAllRead();
  }

  onItemClick(id: string): void {
    this.service.markRead(id);
  }

  relativeTime(iso: string): string {
    return this.service.relativeTime(iso);
  }
}
