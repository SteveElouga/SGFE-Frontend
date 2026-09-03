import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { NotificationsComponent } from './notifications.component';
import { AppNotification, NotificationsService } from '../../core/notifications/notifications.service';

/**
 * Le fil de notifications est entièrement dérivé côté client de requêtes déjà
 * chargées en une fois — sans pagination serveur (voir le commentaire de
 * `NotificationsService`). Rendre 110+ éléments d'un coup dans le DOM alourdit
 * le premier rendu et le défilement pour un gain nul : l'écran ne rend donc
 * qu'une tranche, et l'agrandit au défilement.
 *
 * Ce qui se teste ici n'est pas l'affichage — c'est que la tranche visible
 * grandit au bon moment (près du bas, pas avant) et repart à zéro quand le
 * filtre change, plutôt que de silencieusement rendre la liste entière ou de
 * rester bloquée sur les 20 premiers éléments pour toujours.
 */

function notif(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    tone: 'info',
    category: 'SYSTEME',
    icon: 'pi-bell',
    title: `Titre ${id}`,
    message: `Message ${id}`,
    createdAt: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

describe('NotificationsComponent', () => {
  function setup(count: number) {
    const list = Array.from({ length: count }, (_, i) => notif(String(i)));
    const notifications = signal<AppNotification[]>(list);

    const svc = {
      notifications,
      unreadCount: signal(list.filter((n) => !n.read).length),
      total: signal(list.length),
      markAllRead: vi.fn(),
      markRead: vi.fn(),
      // Un seul groupe : ces tests portent sur le nombre d'éléments rendus,
      // pas sur leur répartition temporelle.
      groupOf: vi.fn().mockReturnValue('TODAY'),
      relativeTime: vi.fn().mockReturnValue('à l’instant'),
    };

    TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        provideRouter([]),
        { provide: NotificationsService, useValue: svc },
      ],
    });

    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, svc };
  }

  function rendus(component: NotificationsComponent): number {
    return component.groups().reduce((n, g) => n + g.items.length, 0);
  }

  it('ne rend que la première page quand le fil dépasse sa taille', () => {
    const { component } = setup(45);
    expect(rendus(component)).toBe(20);
    expect(component.hasMore()).toBe(true);
  });

  it('rend le fil entier sans indicateur "plus" quand il tient sur une page', () => {
    const { component } = setup(12);
    expect(rendus(component)).toBe(12);
    expect(component.hasMore()).toBe(false);
  });

  it('agrandit la tranche visible quand le défilement approche du bas', () => {
    const { component } = setup(45);
    // scrollHeight - scrollTop - clientHeight = 200 < 300 : le seuil est franchi.
    component.onFeedScroll({
      target: { scrollHeight: 1000, scrollTop: 700, clientHeight: 100 },
    } as unknown as Event);
    expect(rendus(component)).toBe(40);
    expect(component.hasMore()).toBe(true);
  });

  it("n'agrandit pas la tranche tant que le bas n'est pas approché", () => {
    const { component } = setup(45);
    // Reste 500px avant le bas : au-delà du seuil de 300px.
    component.onFeedScroll({
      target: { scrollHeight: 1000, scrollTop: 400, clientHeight: 100 },
    } as unknown as Event);
    expect(rendus(component)).toBe(20);
  });

  it("plafonne au nombre réel d'éléments plutôt que de dépasser", () => {
    const { component } = setup(25);
    component.onFeedScroll({
      target: { scrollHeight: 1000, scrollTop: 700, clientHeight: 100 },
    } as unknown as Event);
    expect(rendus(component)).toBe(25);
    expect(component.hasMore()).toBe(false);
  });

  it('ne réagit plus au défilement une fois tout chargé', () => {
    const { component, svc } = setup(15);
    component.onFeedScroll({
      target: { scrollHeight: 1000, scrollTop: 700, clientHeight: 100 },
    } as unknown as Event);
    expect(rendus(component)).toBe(15);
    // Pas d'effet de bord observable non plus sur le service source.
    expect(svc.notifications().length).toBe(15);
  });

  it('repart de la première page quand le filtre change', () => {
    const { component, fixture } = setup(45);
    component.onFeedScroll({
      target: { scrollHeight: 1000, scrollTop: 700, clientHeight: 100 },
    } as unknown as Event);
    expect(rendus(component)).toBe(40);

    component.filter.set('UNREAD');
    // Le reset vit dans un `effect()` : il ne s'exécute qu'au prochain cycle
    // de détection de changements, pas de manière synchrone sur `set()`.
    fixture.detectChanges();
    expect(rendus(component)).toBe(20);
  });
});
