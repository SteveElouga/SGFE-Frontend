import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { GET_IMPAYES } from '../../graphql/queries/paiements.queries';
import { Role } from '../models/user.model';
import type { GetImpayesQuery } from '../../graphql/generated';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: Role[];
  disabled?: boolean;
  /** Libellé court pour l'onglet mobile (défaut : `label`). */
  tabLabel?: string;
}

/**
 * Onglets mobiles par rôle (maquettes M-04/M-05) : 5 sections métier fixes,
 * sans onglet « Plus » — le tiroir complet s'ouvre via l'avatar de la topbar.
 * Les rôles absents de cette table retombent sur leurs premières entrées visibles.
 */
const TABS_BY_ROLE: Partial<Record<Role, string[]>> = {
  ADMIN: ['/dashboard', '/abonnes', '/campagnes', '/impayes', '/factures'],
  COMPTABLE: ['/dashboard', '/factures', '/paiements', '/impayes', '/envois'],
};

/**
 * Source unique de la navigation principale, partagée par la sidebar (tiroir)
 * et la barre d'onglets mobile (`tabItems`, max 5 entrées).
 */
@Injectable({ providedIn: 'root' })
export class NavService {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationsService);
  private readonly apollo = inject(Apollo);

  readonly items: NavItem[] = [
    { label: 'NAV.DASHBOARD', tabLabel: 'NAV.TAB_DASHBOARD', icon: 'pi-th-large', route: '/dashboard', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.TERRAIN', icon: 'pi-map-marker', route: '/terrain', roles: ['ADMIN', 'AGENT', 'SUPERVISEUR'] },
    { label: 'NAV.ABONNES', icon: 'pi-users', route: '/abonnes', roles: ['ADMIN'] },
    { label: 'NAV.CAMPAGNES', icon: 'pi-calendar', route: '/campagnes', roles: ['ADMIN', 'SUPERVISEUR', 'AGENT'] },
    { label: 'NAV.FACTURES', icon: 'pi-file', route: '/factures', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.PAIEMENTS', icon: 'pi-credit-card', route: '/paiements', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.IMPAYES', icon: 'pi-exclamation-triangle', route: '/impayes', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.ENVOIS', icon: 'pi-whatsapp', route: '/envois', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.COMMUNICATION', icon: 'pi-send', route: '/communication', roles: ['ADMIN'] },
    { label: 'NAV.RAPPORTS', icon: 'pi-chart-bar', route: '/rapports', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.NOTIFICATIONS', icon: 'pi-bell', route: '/notifications' },
    { label: 'NAV.CONFIGURATION', icon: 'pi-cog', route: '/configuration', roles: ['ADMIN'] },
  ];

  readonly visibleItems = computed(() =>
    this.items.filter((item) => !item.roles || item.roles.includes(this.auth.role() as Role)),
  );

  /** Onglets de la barre du bas : liste fixe du rôle (M-04/M-05), sinon les 5 premières entrées. */
  readonly tabItems = computed(() => {
    const role = this.auth.role();
    const visible = this.visibleItems();
    const routes = role ? TABS_BY_ROLE[role] : undefined;
    if (!routes) return visible.slice(0, 5);
    return routes
      .map((route) => visible.find((item) => item.route === route))
      .filter((item): item is NavItem => !!item);
  });

  /**
   * Présence d'impayés (point rouge sur l'onglet Impayés — maquette M-04).
   * Chargé une fois par session pour les rôles concernés, en silence : une
   * erreur laisse simplement le point éteint.
   */
  private readonly hasImpayes = signal(false);
  private impayesLoadedFor: Role | null = null;

  constructor() {
    effect(() => {
      const role = this.auth.role();
      if (role !== 'ADMIN' && role !== 'COMPTABLE') {
        this.hasImpayes.set(false);
        this.impayesLoadedFor = null;
        return;
      }
      if (this.impayesLoadedFor === role) return;
      this.impayesLoadedFor = role;
      untracked(() => void this.loadImpayesDot());
    });
  }

  private async loadImpayesDot(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<GetImpayesQuery>({ query: GET_IMPAYES,
          fetchPolicy: 'network-only',
          context: { silentError: true },
        }),
      );
      this.hasImpayes.set((res.data?.impayes?.length ?? 0) > 0);
    } catch {
      this.hasImpayes.set(false);
    }
  }

  /** Badge numérique (non-lues) pour l'entrée Notifications. */
  badgeFor(item: NavItem): number | null {
    if (item.route === '/notifications') return this.notifications.unreadCount() || null;
    return null;
  }

  /** Point d'alerte (sans nombre) pour l'onglet Impayés. */
  dotFor(item: NavItem): boolean {
    return item.route === '/impayes' && this.hasImpayes();
  }
}
