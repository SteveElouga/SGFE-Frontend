import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { NavItem, NavService } from './nav.service';
import { Role } from '../models/user.model';

/**
 * Source unique de la navigation (sidebar + onglets mobiles). Le point le
 * plus fragile n'est pas le filtrage par rôle — direct — mais le point rouge
 * `impayes` : chargé une seule fois par rôle, en silence, jamais pour un rôle
 * qui n'a pas accès à la donnée.
 */
function setup(roleInitial: Role | null) {
  const roleSignal = signal<Role | null>(roleInitial);
  const querySpy = vi.fn();
  const unreadCountSpy = vi.fn(() => 0);

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { role: roleSignal } },
      { provide: NotificationsService, useValue: { unreadCount: unreadCountSpy } },
      { provide: Apollo, useValue: { query: querySpy } },
    ],
  });

  const service = TestBed.inject(NavService);
  return { service, roleSignal, querySpy, unreadCountSpy };
}

async function flush(): Promise<void> {
  TestBed.tick();
  await Promise.resolve();
  await Promise.resolve();
}

describe('NavService · visibilité par rôle', () => {
  it('un ADMIN voit les entrées réservées à son rôle', () => {
    const { service } = setup('ADMIN');
    const routes = service.visibleItems().map((i) => i.route);
    expect(routes).toContain('/abonnes');
    expect(routes).toContain('/communication');
  });

  it('un COMPTABLE ne voit ni abonnés ni communication', () => {
    const { service } = setup('COMPTABLE');
    const routes = service.visibleItems().map((i) => i.route);
    expect(routes).not.toContain('/abonnes');
    expect(routes).not.toContain('/communication');
    expect(routes).toContain('/factures');
  });

  it('une entrée sans `roles` déclarés (Notifications) est visible de tous', () => {
    const { service } = setup('AGENT');
    expect(service.visibleItems().map((i) => i.route)).toContain('/notifications');
  });

  it('un AGENT ne voit que terrain, campagnes et notifications', () => {
    const { service } = setup('AGENT');
    const routes = service.visibleItems().map((i) => i.route).sort();
    expect(routes).toEqual(['/campagnes', '/notifications', '/terrain'].sort());
  });

  it('sans rôle (non authentifié), aucune entrée à rôles restreints n’est visible', () => {
    const { service } = setup(null);
    expect(service.visibleItems().map((i) => i.route)).toEqual(['/notifications']);
  });
});

describe('NavService · onglets mobiles', () => {
  it('ADMIN a la liste fixe de la maquette M-04, dans son ordre', () => {
    const { service } = setup('ADMIN');
    expect(service.tabItems().map((i) => i.route)).toEqual([
      '/dashboard', '/abonnes', '/campagnes', '/impayes', '/factures',
    ]);
  });

  it('COMPTABLE a sa propre liste fixe (M-05)', () => {
    const { service } = setup('COMPTABLE');
    expect(service.tabItems().map((i) => i.route)).toEqual([
      '/dashboard', '/factures', '/paiements', '/impayes', '/envois',
    ]);
  });

  it('un rôle sans liste fixe (AGENT) retombe sur ses 5 premières entrées visibles', () => {
    const { service } = setup('AGENT');
    expect(service.tabItems()).toEqual(service.visibleItems().slice(0, 5));
  });

  it('un rôle sans liste fixe et non authentifié retombe aussi sur les 5 premières visibles', () => {
    const { service } = setup(null);
    expect(service.tabItems()).toEqual(service.visibleItems().slice(0, 5));
  });
});

describe('NavService · badges et point d’alerte', () => {
  const itemImpayes: NavItem = { label: '', icon: '', route: '/impayes' };
  const itemNotifications: NavItem = { label: '', icon: '', route: '/notifications' };
  const itemAutre: NavItem = { label: '', icon: '', route: '/dashboard' };

  it('badgeFor rend le compteur non-lues pour Notifications', () => {
    const { service, unreadCountSpy } = setup('ADMIN');
    unreadCountSpy.mockReturnValue(3);
    expect(service.badgeFor(itemNotifications)).toBe(3);
  });

  it('badgeFor rend null quand le compteur vaut zéro (pas de badge « 0 »)', () => {
    const { service, unreadCountSpy } = setup('ADMIN');
    unreadCountSpy.mockReturnValue(0);
    expect(service.badgeFor(itemNotifications)).toBeNull();
  });

  it('badgeFor rend null pour toute autre entrée', () => {
    const { service, unreadCountSpy } = setup('ADMIN');
    unreadCountSpy.mockReturnValue(5);
    expect(service.badgeFor(itemAutre)).toBeNull();
  });

  it('dotFor charge la présence d’impayés pour un ADMIN et l’affiche', async () => {
    const { service, querySpy } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [{ factureId: 'f1' }] } }));
    await flush();
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(service.dotFor(itemImpayes)).toBe(true);
  });

  it('dotFor reste éteint quand il n’y a aucun impayé', async () => {
    const { service, querySpy } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [] } }));
    await flush();
    expect(service.dotFor(itemImpayes)).toBe(false);
  });

  it('dotFor ne s’allume jamais pour une autre entrée', async () => {
    const { service, querySpy } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [{ factureId: 'f1' }] } }));
    await flush();
    expect(service.dotFor(itemAutre)).toBe(false);
  });

  it('ne charge jamais les impayés pour un AGENT (accès refusé côté gateway)', async () => {
    const { querySpy } = setup('AGENT');
    await flush();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('ne charge jamais les impayés pour un SUPERVISEUR', async () => {
    const { querySpy } = setup('SUPERVISEUR');
    await flush();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('une erreur réseau laisse le point éteint, en silence', async () => {
    const { service, querySpy } = setup('ADMIN');
    querySpy.mockReturnValue(throwError(() => new Error('réseau')));
    await flush();
    expect(service.dotFor(itemImpayes)).toBe(false);
  });

  it('ne recharge pas une seconde fois pour le même rôle', async () => {
    const { querySpy, roleSignal } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [] } }));
    await flush();
    expect(querySpy).toHaveBeenCalledTimes(1);

    // Un signal réécrit avec la même valeur ne déclenche normalement pas
    // l'effect (égalité par défaut) — mais même s'il le faisait, la garde
    // `impayesLoadedFor === role` doit empêcher un second appel réseau.
    roleSignal.set('ADMIN');
    await flush();
    expect(querySpy).toHaveBeenCalledTimes(1);
  });

  it('recharge quand le rôle change vers un autre rôle autorisé', async () => {
    const { querySpy, roleSignal } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [] } }));
    await flush();
    expect(querySpy).toHaveBeenCalledTimes(1);

    roleSignal.set('COMPTABLE');
    await flush();
    expect(querySpy).toHaveBeenCalledTimes(2);
  });

  it('un passage à un rôle non autorisé éteint le point sans nouvel appel', async () => {
    const { service, querySpy, roleSignal } = setup('ADMIN');
    querySpy.mockReturnValue(of({ data: { impayes: [{ factureId: 'f1' }] } }));
    await flush();
    expect(service.dotFor(itemImpayes)).toBe(true);

    roleSignal.set('AGENT');
    await flush();
    expect(service.dotFor(itemImpayes)).toBe(false);
    expect(querySpy).toHaveBeenCalledTimes(1);
  });
});
