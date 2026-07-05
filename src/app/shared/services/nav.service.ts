import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { Role } from '../models/user.model';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: Role[];
  disabled?: boolean;
}

/**
 * Source unique de la navigation principale, partagée par la sidebar (tiroir)
 * et la barre d'onglets mobile. `primaryItems` = les 4 premières entrées
 * visibles pour le rôle courant → onglets du bas ; le reste passe par « Plus ».
 */
@Injectable({ providedIn: 'root' })
export class NavService {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationsService);

  readonly items: NavItem[] = [
    { label: 'NAV.DASHBOARD', icon: 'pi-th-large', route: '/dashboard', roles: ['ADMIN'] },
    { label: 'NAV.TERRAIN', icon: 'pi-map-marker', route: '/terrain', roles: ['AGENT'] },
    { label: 'NAV.ABONNES', icon: 'pi-users', route: '/abonnes', roles: ['ADMIN'] },
    { label: 'NAV.CAMPAGNES', icon: 'pi-calendar', route: '/campagnes', roles: ['ADMIN', 'SUPERVISEUR', 'AGENT'] },
    { label: 'NAV.FACTURES', icon: 'pi-file', route: '/factures', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.PAIEMENTS', icon: 'pi-credit-card', route: '/paiements', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.IMPAYES', icon: 'pi-exclamation-triangle', route: '/impayes', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.ENVOIS', icon: 'pi-whatsapp', route: '/envois', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.RAPPORTS', icon: 'pi-chart-bar', route: '/rapports', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.NOTIFICATIONS', icon: 'pi-bell', route: '/notifications' },
    { label: 'NAV.CONFIGURATION', icon: 'pi-cog', route: '/configuration', roles: ['ADMIN'] },
  ];

  readonly visibleItems = computed(() =>
    this.items.filter((item) => !item.roles || item.roles.includes(this.auth.role() as Role)),
  );

  /** 4 premières entrées visibles = onglets principaux de la barre du bas. */
  readonly primaryItems = computed(() => this.visibleItems().slice(0, 4));

  /** Badge dynamique (non-lues) pour l'entrée Notifications. */
  badgeFor(item: NavItem): number | null {
    if (item.route === '/notifications') return this.notifications.unreadCount() || null;
    return null;
  }
}
