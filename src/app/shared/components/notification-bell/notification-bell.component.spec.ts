import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { NotificationBellComponent } from './notification-bell.component';
import { AppNotification, NotificationsService } from '../../../core/notifications/notifications.service';

describe('NotificationBellComponent', () => {
  function notif(p: Partial<AppNotification> = {}): AppNotification {
    return {
      id: 'n-1',
      tone: 'warning',
      category: 'RELANCES',
      icon: 'pi-exclamation-triangle',
      title: 'Facture impayée',
      message: 'Awa Koné doit 5 000 FCFA',
      createdAt: '2026-08-20T10:00:00Z',
      read: false,
      ...p,
    };
  }

  function setup(notifications: AppNotification[] = []) {
    const markAllRead = vi.fn();
    const markRead = vi.fn();
    const service = {
      unreadCount: signal(notifications.filter((n) => !n.read).length),
      notifications: signal(notifications),
      markAllRead,
      markRead,
      relativeTime: (iso: string) => `il y a peu (${iso.slice(0, 10)})`,
    };
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: NotificationsService, useValue: service },
      ],
    });
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, markAllRead, markRead };
  }

  it('affiche le nombre de non-lus sur la cloche', () => {
    const { racine } = setup([notif({ read: false }), notif({ id: 'n-2', read: true })]);
    expect(racine.querySelector('.nb__count')?.textContent).toBe('1');
  });

  it("ne montre aucun badge quand tout est lu", () => {
    const { racine } = setup([notif({ read: true })]);
    expect(racine.querySelector('.nb__count')).toBeNull();
  });

  it('le panneau est fermé par défaut', () => {
    const { c, racine } = setup();
    expect(c.open()).toBe(false);
    expect(racine.querySelector('.nb__panel--open')).toBeNull();
  });

  it('toggle ouvre puis referme le panneau', () => {
    const { c } = setup();
    c.toggle();
    expect(c.open()).toBe(true);
    c.toggle();
    expect(c.open()).toBe(false);
  });

  it('close ne fait rien si le panneau est déjà fermé', () => {
    const { c } = setup();
    c.close();
    expect(c.open()).toBe(false);
  });

  it('Échap referme le panneau', () => {
    const { c } = setup();
    c.toggle();
    expect(c.open()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c.open()).toBe(false);
  });

  it('onglet ALL affiche toutes les notifications récentes (5 max)', () => {
    const beaucoup = Array.from({ length: 7 }, (_, i) => notif({ id: `n-${i}` }));
    const { c } = setup(beaucoup);
    expect(c.recent()).toHaveLength(5);
  });

  it('onglet UNREAD ne garde que les non-lues', () => {
    const { c } = setup([notif({ id: 'a', read: false }), notif({ id: 'b', read: true })]);
    c.tab.set('UNREAD');
    expect(c.recent().map((n) => n.id)).toEqual(['a']);
  });

  it('markAllRead délègue au service', () => {
    const { c, markAllRead } = setup([notif()]);
    c.markAllRead();
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it('cliquer une notification la marque lue via le service', () => {
    const { c, markRead } = setup([notif({ id: 'n-9' })]);
    c.onItemClick('n-9');
    expect(markRead).toHaveBeenCalledWith('n-9');
  });

  it('affiche un état vide quand il n’y a aucune notification', () => {
    const { fixture, c, racine } = setup([]);
    c.toggle();
    fixture.detectChanges();
    expect(racine.querySelector('.nb__empty')).toBeTruthy();
  });

  it('affiche chaque notification récente avec son titre et son message', () => {
    const { fixture, c, racine } = setup([notif({ title: 'Paiement encaissé', message: '5 000 FCFA reçus' })]);
    c.toggle();
    fixture.detectChanges();
    const item = racine.querySelector('.nb__item');
    expect(item?.textContent).toContain('Paiement encaissé');
    expect(item?.textContent).toContain('5 000 FCFA reçus');
  });
});
