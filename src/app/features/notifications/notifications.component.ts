import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AppNotification,
  NotifAction,
  NotifGroup,
  NotificationsService,
} from '../../core/notifications/notifications.service';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../shared/services/toast.service';

type NotifFilter = 'ALL' | 'UNREAD' | 'PAIEMENTS' | 'RELANCES' | 'SYSTEME';

interface FilterChip {
  value: NotifFilter;
  labelKey: string;
  count: 'total' | 'unread' | null;
}

interface FeedGroup {
  key: NotifGroup;
  labelKey: string;
  items: AppNotification[];
}

@Component({
  imports: [TranslatePipe, PageTopbarComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  private readonly service = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly filter = signal<NotifFilter>('ALL');

  readonly unreadCount = this.service.unreadCount;
  readonly total = this.service.total;

  readonly chips: FilterChip[] = [
    { value: 'ALL', labelKey: 'NOTIFICATIONS.FILTER.ALL', count: 'total' },
    { value: 'UNREAD', labelKey: 'NOTIFICATIONS.FILTER.UNREAD', count: 'unread' },
    { value: 'PAIEMENTS', labelKey: 'NOTIFICATIONS.FILTER.PAIEMENTS', count: null },
    { value: 'RELANCES', labelKey: 'NOTIFICATIONS.FILTER.RELANCES', count: null },
    { value: 'SYSTEME', labelKey: 'NOTIFICATIONS.FILTER.SYSTEME', count: null },
  ];

  readonly subtitle = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant(
      'NOTIFICATIONS.SUBTITLE',
      { unread: this.unreadCount(), total: this.total() },
      lang,
    );
  });

  private readonly filtered = computed(() => {
    const all = this.service.notifications();
    switch (this.filter()) {
      case 'UNREAD': return all.filter((n) => !n.read);
      case 'PAIEMENTS': return all.filter((n) => n.category === 'PAIEMENTS');
      case 'RELANCES': return all.filter((n) => n.category === 'RELANCES');
      case 'SYSTEME': return all.filter((n) => n.category === 'SYSTEME');
      default: return all;
    }
  });

  readonly groups = computed((): FeedGroup[] => {
    const order: NotifGroup[] = ['TODAY', 'YESTERDAY', 'WEEK', 'OLDER'];
    const filtered = this.filtered();
    return order
      .map((g) => ({
        key: g,
        labelKey: `NOTIFICATIONS.GROUP.${g}`,
        items: filtered.filter((n) => this.service.groupOf(n.createdAt) === g),
      }))
      .filter((grp) => grp.items.length > 0);
  });

  readonly isEmpty = computed(() => this.filtered().length === 0);

  chipCount(chip: FilterChip): number | null {
    if (chip.count === 'total') return this.total();
    if (chip.count === 'unread') return this.unreadCount();
    return null;
  }

  markAllRead(): void {
    this.service.markAllRead();
  }

  onItemClick(n: AppNotification): void {
    if (!n.read) this.service.markRead(n.id);
  }

  onAction(n: AppNotification, action: NotifAction, event: Event): void {
    event.stopPropagation();
    this.service.markRead(n.id);
    switch (action.type) {
      case 'RETRY':
        this.toast.info(this.translate.instant('NOTIFICATIONS.TOAST_RETRY'));
        break;
      case 'FIX_NUMBER':
        void this.router.navigate(['/abonnes']);
        break;
      case 'VIEW_RECEIPT':
        void this.router.navigate(['/paiements']);
        break;
    }
  }

  relativeTime(iso: string): string {
    return this.service.relativeTime(iso);
  }
}
