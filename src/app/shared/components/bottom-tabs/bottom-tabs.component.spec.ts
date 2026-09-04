import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { BottomTabsComponent } from './bottom-tabs.component';
import { NavService, NavItem } from '../../services/nav.service';

/**
 * Barre d'onglets mobile : reflète purement `NavService` (source unique de la
 * navigation, déjà testée ailleurs). Ce composant ne décide rien lui-même —
 * ce qui compte est qu'il affiche fidèlement ce que le service annonce, badge
 * et pastille d'alerte compris.
 */
describe('BottomTabsComponent', () => {
  const ITEMS: NavItem[] = [
    { label: 'NAV.DASHBOARD', tabLabel: 'NAV.TAB_DASHBOARD', icon: 'pi-th-large', route: '/dashboard' },
    { label: 'NAV.IMPAYES', icon: 'pi-exclamation-triangle', route: '/impayes' },
    { label: 'NAV.NOTIFICATIONS', icon: 'pi-bell', route: '/notifications' },
  ];

  function setup(navMock: Partial<NavService> = {}) {
    const defaultNav = {
      tabItems: signal(ITEMS),
      badgeFor: (item: NavItem) => (item.route === '/notifications' ? 3 : null),
      dotFor: (item: NavItem) => item.route === '/impayes',
      ...navMock,
    };
    TestBed.configureTestingModule({
      imports: [BottomTabsComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: NavService, useValue: defaultNav },
      ],
    });
    const fixture = TestBed.createComponent(BottomTabsComponent);
    fixture.detectChanges();
    return { racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche un onglet par entrée annoncée par le service', () => {
    const { racine } = setup();
    expect(racine.querySelectorAll('.tabs__tab')).toHaveLength(3);
  });

  it('utilise tabLabel quand il existe, sinon retombe sur label', () => {
    const { racine } = setup();
    const tabs = [...racine.querySelectorAll('.tabs__tab')];
    // Le premier a un tabLabel dédié : c'est lui qui doit apparaître, pas label.
    expect(tabs[0].textContent).toContain('NAV.TAB_DASHBOARD');
    // Le deuxième n'en a pas : label sert de repli.
    expect(tabs[1].textContent).toContain('NAV.IMPAYES');
  });

  it('affiche le badge numérique renvoyé par badgeFor', () => {
    const { racine } = setup();
    const notif = [...racine.querySelectorAll('.tabs__tab')].find((t) => t.textContent?.includes('NAV.NOTIFICATIONS'))!;
    expect(notif.querySelector('.tabs__badge')?.textContent).toBe('3');
    expect(notif.querySelector('.tabs__dot')).toBeNull();
  });

  it("affiche la pastille d'alerte quand il n'y a pas de badge mais dotFor est vrai", () => {
    const { racine } = setup();
    const impayes = [...racine.querySelectorAll('.tabs__tab')].find((t) => t.textContent?.includes('NAV.IMPAYES'))!;
    expect(impayes.querySelector('.tabs__dot')).toBeTruthy();
    expect(impayes.querySelector('.tabs__badge')).toBeNull();
  });

  it("n'affiche ni badge ni pastille pour un onglet neutre", () => {
    const { racine } = setup();
    const dashboard = [...racine.querySelectorAll('.tabs__tab')].find((t) => t.textContent?.includes('NAV.TAB_DASHBOARD'))!;
    expect(dashboard.querySelector('.tabs__badge')).toBeNull();
    expect(dashboard.querySelector('.tabs__dot')).toBeNull();
  });

  it("ne montre aucun onglet quand le service n'en annonce aucun", () => {
    const { racine } = setup({ tabItems: signal([]) });
    expect(racine.querySelectorAll('.tabs__tab')).toHaveLength(0);
  });
});
