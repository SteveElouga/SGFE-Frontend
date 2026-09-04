import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { SidebarComponent } from './sidebar.component';
import { NavService, NavItem } from '../../services/nav.service';
import { LayoutService } from '../../services/layout.service';
import { GET_CAMPAGNE_ACTIVE, GET_PROGRESSION } from '../../../graphql/queries/campagnes.queries';

/**
 * Tiroir de navigation : liste des entrées visibles (déléguée à `NavService`,
 * déjà testé) + widget de campagne active, chargé une fois au montage. Ce
 * widget est la seule logique propre à la sidebar — c'est lui qu'on teste ici.
 */
describe('SidebarComponent', () => {
  const ITEMS: NavItem[] = [{ label: 'NAV.ABONNES', icon: 'pi-users', route: '/abonnes' }];

  function setup(queryImpl?: (options: { query: unknown }) => unknown) {
    const query = vi.fn(queryImpl ?? (() => of({ data: { campagnes: [] } })));
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: Apollo, useValue: { query } },
        {
          provide: NavService,
          useValue: { visibleItems: signal(ITEMS), badgeFor: () => null, dotFor: () => false },
        },
      ],
    });
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, query };
  }

  it("n'affiche pas le widget de campagne sans campagne en cours", async () => {
    const { fixture, c, racine } = setup(() => of({ data: { campagnes: [] } }));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(c.campagneActive()).toBeNull();
    expect(racine.querySelector('.sidebar__campaign')).toBeNull();
  });

  it('charge et affiche la campagne EN_COURS avec sa progression', async () => {
    const { fixture, c, racine } = setup((options) => {
      if (options.query === GET_CAMPAGNE_ACTIVE) {
        return of({
          data: {
            campagnes: [
              { campagneId: 'c-1', periodeMois: 8, periodeAnnee: 2026, statut: 'EN_COURS' },
              { campagneId: 'c-0', periodeMois: 7, periodeAnnee: 2026, statut: 'CLOTUREE' },
            ],
          },
        });
      }
      if (options.query === GET_PROGRESSION) {
        return of({ data: { progression: { totalAbonnes: 200, nbReleves: 150, nbEnAttente: 50, pourcentage: 75 } } });
      }
      return of({ data: {} });
    });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(c.campagneActive()).toMatchObject({ campagneId: 'c-1', periodeMois: 8, periodeAnnee: 2026 });
    expect(c.campagnePeriode()).toBe('Août 2026');
    expect(c.campagneProgression()).toEqual({ pourcentage: 75, label: '75% · 150/200 relevés' });
    expect(racine.querySelector('.sidebar__campaign-period')?.textContent).toBe('Août 2026');
  });

  it('ignore les campagnes qui ne sont pas EN_COURS', async () => {
    const { fixture, c } = setup((options) => {
      if (options.query === GET_CAMPAGNE_ACTIVE) {
        return of({ data: { campagnes: [{ campagneId: 'c-1', periodeMois: 1, periodeAnnee: 2026, statut: 'CLOTUREE' }] } });
      }
      return of({ data: {} });
    });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(c.campagneActive()).toBeNull();
  });

  it("reste fonctionnelle si le chargement de la campagne échoue", async () => {
    const { fixture, c, racine } = setup(() => throwError(() => new Error('Réseau indisponible')));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(c.campagneActive()).toBeNull();
    expect(racine.querySelector('.sidebar')).toBeTruthy(); // le reste du composant fonctionne
  });

  it('affiche une entrée de navigation par élément visible', () => {
    const { racine } = setup();
    const items = racine.querySelectorAll('.sidebar__nav-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('NAV.ABONNES');
  });

  it('le bouton de fermeture ferme le menu via LayoutService', () => {
    const { racine } = setup();
    const layout = TestBed.inject(LayoutService);
    layout.openMenu();
    expect(layout.menuOpen()).toBe(true);
    (racine.querySelector('.sidebar__close') as HTMLButtonElement).click();
    expect(layout.menuOpen()).toBe(false);
  });
});
