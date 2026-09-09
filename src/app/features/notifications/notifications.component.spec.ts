import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { NotificationsComponent } from './notifications.component';
import { AppNotification, NotifAction, NotificationsService } from '../../core/notifications/notifications.service';
import { FacturesService } from '../../core/factures/factures.service';
import { ToastService } from '../../shared/services/toast.service';

/** Laisse les micro-tâches (résolution de Promise) s'écouler dans le test. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

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
      refresh: vi.fn().mockResolvedValue(undefined),
      // Un seul groupe : ces tests portent sur le nombre d'éléments rendus,
      // pas sur leur répartition temporelle.
      groupOf: vi.fn().mockReturnValue('TODAY'),
      relativeTime: vi.fn().mockReturnValue('à l’instant'),
    };

    const router = { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() };
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const factures = { renvoyerEnvoi: vi.fn().mockResolvedValue({ envoiId: 'e-1', statut: 'ENVOYE', dateEnvoi: '', erreur: '' }) };

    TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        provideRouter([]),
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
        { provide: NotificationsService, useValue: svc },
        { provide: FacturesService, useValue: factures },
      ],
    });

    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, svc, router, toast, factures };
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

  describe('filtrage par onglet', () => {
    function setupCategories() {
      const list = [
        notif('1', { category: 'PAIEMENTS', read: false }),
        notif('2', { category: 'RELANCES', read: true }),
        notif('3', { category: 'SYSTEME', read: false }),
        notif('4', { category: 'PAIEMENTS', read: true }),
      ];
      const notifications = signal<AppNotification[]>(list);
      const svc = {
        notifications,
        unreadCount: signal(list.filter((n) => !n.read).length),
        total: signal(list.length),
        markAllRead: vi.fn(),
        markRead: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        groupOf: vi.fn().mockReturnValue('TODAY'),
        relativeTime: vi.fn().mockReturnValue('à l’instant'),
      };
      const router = { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() };
      const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
      const factures = { renvoyerEnvoi: vi.fn().mockResolvedValue({ envoiId: 'e-1', statut: 'ENVOYE', dateEnvoi: '', erreur: '' }) };
      TestBed.configureTestingModule({
        imports: [NotificationsComponent],
        providers: [
          provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
          provideRouter([]),
          { provide: Router, useValue: router },
          { provide: ToastService, useValue: toast },
          { provide: NotificationsService, useValue: svc },
          { provide: FacturesService, useValue: factures },
        ],
      });
      const fixture = TestBed.createComponent(NotificationsComponent);
      fixture.detectChanges();
      return { component: fixture.componentInstance };
    }

    it('« Non lues » ne garde que les notifications non lues', () => {
      const { component } = setupCategories();
      component.filter.set('UNREAD');
      expect(rendus(component)).toBe(2);
    });

    it('un filtre de catégorie ne garde que cette catégorie', () => {
      const { component } = setupCategories();
      component.filter.set('PAIEMENTS');
      expect(rendus(component)).toBe(2);

      component.filter.set('RELANCES');
      expect(rendus(component)).toBe(1);
    });

    it('isEmpty reste faux tant qu’au moins une notification correspond au filtre', () => {
      const { component } = setupCategories();
      component.filter.set('RELANCES'); // une seule notification de cette catégorie, mais elle existe
      expect(component.isEmpty()).toBe(false);
    });

    it('isEmpty devient vrai quand le fil ne contient plus aucune notification', () => {
      const { component } = setup(0);
      expect(component.isEmpty()).toBe(true);
    });
  });

  describe('actions', () => {
    function notifAvecAction(action: NotifAction, overrides: Partial<AppNotification> = {}): AppNotification {
      return notif('n1', { actions: [action], ...overrides });
    }

    it('markAllRead délègue au service', () => {
      const { component, svc } = setup(3);
      component.markAllRead();
      expect(svc.markAllRead).toHaveBeenCalledTimes(1);
    });

    it('onItemClick marque lue une notification non lue', () => {
      const { component, svc } = setup(3);
      const n = notif('x', { read: false });
      component.onItemClick(n);
      expect(svc.markRead).toHaveBeenCalledWith('x');
    });

    it('onItemClick ne fait rien sur une notification déjà lue', () => {
      const { component, svc } = setup(3);
      const n = notif('x', { read: true });
      component.onItemClick(n);
      expect(svc.markRead).not.toHaveBeenCalled();
    });

    it('onAction arrête la propagation et marque la notification lue', () => {
      const { component, svc } = setup(3);
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'RETRY', labelKey: 'K', variant: 'danger' }, { envoiId: 'e-1' });
      component.onAction(n, n.actions![0], event);
      expect((event.stopPropagation as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
      expect(svc.markRead).toHaveBeenCalledWith('n1');
    });

    it('RETRY appelle réellement renvoyerEnvoi (pas seulement un toast) et rafraîchit le fil', async () => {
      const { component, router, toast, factures, svc } = setup(3);
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'RETRY', labelKey: 'K', variant: 'danger' }, { envoiId: 'e-42' });

      component.onAction(n, n.actions![0], event);
      await flush();

      expect(factures.renvoyerEnvoi).toHaveBeenCalledTimes(1);
      expect(factures.renvoyerEnvoi).toHaveBeenCalledWith('e-42');
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.info).not.toHaveBeenCalled();
      expect(svc.refresh).toHaveBeenCalledTimes(1);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('RETRY affiche une erreur et ne rafraîchit pas si le renvoi échoue', async () => {
      const { component, toast, factures, svc } = setup(3);
      factures.renvoyerEnvoi.mockRejectedValueOnce(new Error('whatsapp-service indisponible'));
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'RETRY', labelKey: 'K', variant: 'danger' }, { envoiId: 'e-42' });

      component.onAction(n, n.actions![0], event);
      await flush();

      expect(factures.renvoyerEnvoi).toHaveBeenCalledTimes(1);
      expect(factures.renvoyerEnvoi).toHaveBeenCalledWith('e-42');
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(svc.refresh).not.toHaveBeenCalled();
      expect(component.retryingEnvoiId()).toBeNull();
    });

    it('RETRY ignore un second déclenchement pendant que le renvoi est en cours', async () => {
      let resolve!: () => void;
      const enVol = new Promise<{ envoiId: string; statut: string; dateEnvoi: string; erreur: string }>(
        (r) => (resolve = () => r({ envoiId: 'e-42', statut: 'ENVOYE', dateEnvoi: '', erreur: '' })),
      );
      const { component, factures } = setup(3);
      factures.renvoyerEnvoi.mockReturnValue(enVol);
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'RETRY', labelKey: 'K', variant: 'danger' }, { envoiId: 'e-42' });

      component.onAction(n, n.actions![0], event);
      component.onAction(n, n.actions![0], event);
      resolve();
      await flush();

      expect(factures.renvoyerEnvoi).toHaveBeenCalledTimes(1);
    });

    it('FIX_NUMBER redirige vers la fiche abonnés', () => {
      const { component, router } = setup(3);
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'FIX_NUMBER', labelKey: 'K', variant: 'dark' });
      component.onAction(n, n.actions![0], event);
      expect(router.navigate).toHaveBeenCalledWith(['/abonnes']);
    });

    it('VIEW_RECEIPT redirige vers le journal des paiements', () => {
      const { component, router } = setup(3);
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      const n = notifAvecAction({ type: 'VIEW_RECEIPT', labelKey: 'K', variant: 'ghost' });
      component.onAction(n, n.actions![0], event);
      expect(router.navigate).toHaveBeenCalledWith(['/paiements']);
    });
  });

  describe('chipCount', () => {
    it('reporte le total pour le chip "Tous" et le nombre de non-lues pour "Non lues"', () => {
      const { component } = setup(5);
      const total = component.chips.find((c) => c.value === 'ALL')!;
      const unread = component.chips.find((c) => c.value === 'UNREAD')!;
      expect(component.chipCount(total)).toBe(5);
      expect(component.chipCount(unread)).toBe(5); // toutes non lues (fixture par défaut)
    });

    it('ne reporte aucun compte pour les chips de catégorie', () => {
      const { component } = setup(3);
      const paiements = component.chips.find((c) => c.value === 'PAIEMENTS')!;
      expect(component.chipCount(paiements)).toBeNull();
    });
  });
});
