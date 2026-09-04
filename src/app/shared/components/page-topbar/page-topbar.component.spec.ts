import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { PageTopbarComponent } from './page-topbar.component';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { LayoutService } from '../../services/layout.service';

/**
 * Barre de titre standard : titre/sous-titre/surtitre, fil d'ariane retour
 * optionnel, cloche conditionnelle, hamburger qui ouvre le tiroir mobile.
 */
describe('PageTopbarComponent', () => {
  function makeNotifService(unread = 0) {
    return { unreadCount: signal(unread), notifications: signal([]), markAllRead: vi.fn(), markRead: vi.fn(), relativeTime: () => '' };
  }

  function setup(inputs: Partial<{
    title: string; subtitle: string; overline: string; backLink: string; backLabel: string; showBell: boolean;
  }> = {}, unread = 0) {
    TestBed.configureTestingModule({
      imports: [PageTopbarComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: NotificationsService, useValue: makeNotifService(unread) },
      ],
    });
    const fixture = TestBed.createComponent(PageTopbarComponent);
    fixture.componentRef.setInput('title', inputs.title ?? 'Abonnés');
    if (inputs.subtitle !== undefined) fixture.componentRef.setInput('subtitle', inputs.subtitle);
    if (inputs.overline !== undefined) fixture.componentRef.setInput('overline', inputs.overline);
    if (inputs.backLink !== undefined) fixture.componentRef.setInput('backLink', inputs.backLink);
    if (inputs.backLabel !== undefined) fixture.componentRef.setInput('backLabel', inputs.backLabel);
    if (inputs.showBell !== undefined) fixture.componentRef.setInput('showBell', inputs.showBell);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le titre en h1', () => {
    const { racine } = setup({ title: 'Campagnes' });
    expect(racine.querySelector('h1.page-topbar__title')?.textContent).toBe('Campagnes');
  });

  it('affiche le sous-titre et le surtitre quand ils sont fournis', () => {
    const { racine } = setup({ subtitle: '128 abonnés', overline: 'Facturation Août 2026' });
    expect(racine.querySelector('.page-topbar__subtitle')?.textContent).toBe('128 abonnés');
    expect(racine.querySelector('.page-topbar__overline')?.textContent).toBe('Facturation Août 2026');
  });

  it('ne montre ni sous-titre ni surtitre par défaut', () => {
    const { racine } = setup();
    expect(racine.querySelector('.page-topbar__subtitle')).toBeNull();
    expect(racine.querySelector('.page-topbar__overline')).toBeNull();
  });

  it("n'affiche aucun fil d'ariane retour sans backLink", () => {
    const { racine } = setup();
    expect(racine.querySelector('.page-topbar__back')).toBeNull();
  });

  it('affiche le lien de retour avec son libellé quand backLink est fourni', () => {
    const { racine } = setup({ backLink: '/abonnes', backLabel: 'Abonnés' });
    const lien = racine.querySelector('a.page-topbar__back') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/abonnes');
    expect(lien.getAttribute('aria-label')).toBe('Abonnés');
  });

  it('affiche la cloche par défaut', () => {
    const { racine } = setup();
    expect(racine.querySelector('app-notification-bell')).toBeTruthy();
  });

  it('masque la cloche quand showBell est faux (écran Notifications)', () => {
    const { racine } = setup({ showBell: false });
    expect(racine.querySelector('app-notification-bell')).toBeNull();
  });

  it('signale visuellement des notifications non lues sur la cloche mobile', () => {
    const { racine } = setup({}, 3);
    expect(racine.querySelector('.page-topbar__bell--has-unread')).toBeTruthy();
  });

  it('pas de marqueur non-lu quand tout est lu', () => {
    const { racine } = setup({}, 0);
    expect(racine.querySelector('.page-topbar__bell--has-unread')).toBeNull();
  });

  it('le bouton hamburger ouvre le menu via LayoutService', () => {
    const { racine } = setup();
    const layout = TestBed.inject(LayoutService);
    expect(layout.menuOpen()).toBe(false);
    (racine.querySelector('.page-topbar__menu') as HTMLButtonElement).click();
    expect(layout.menuOpen()).toBe(true);
  });

  it('projette les actions et le héro dans les emplacements dédiés', () => {
    @Component({
      imports: [PageTopbarComponent],
      template: `
        <app-page-topbar title="Abonnés">
          <button class="mon-action">Nouveau</button>
          <div topbar-hero class="mon-hero">Progression 42%</div>
        </app-page-topbar>
      `,
    })
    class HostComponent {}

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: NotificationsService, useValue: makeNotifService(0) },
      ],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.page-topbar__right .mon-action')).toBeTruthy();
    expect(racine.querySelector('.mon-hero')?.textContent).toContain('Progression 42%');
  });
});
