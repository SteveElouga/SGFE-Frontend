import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Apollo } from 'apollo-angular';
import { ShellComponent } from './shell.component';
import { LayoutService } from '../../shared/services/layout.service';
import { AbonnesService } from '../../core/abonnes/abonnes.service';
import { NotificationsService } from '../../core/notifications/notifications.service';

/**
 * Le cadre autour de tous les écrans.
 *
 * Trois manques y touchaient l'application entière plutôt qu'un écran.
 *
 * Le tiroir mobile ne se fermait qu'au clic sur son voile, lequel est
 * `aria-hidden` : quelqu'un au clavier n'avait aucun moyen d'en sortir
 * autrement qu'en le traversant en entier.
 *
 * Le contenu derrière restait atteignable à la tabulation alors qu'un voile le
 * recouvrait, et le lecteur d'écran continuait d'annoncer ce qu'on ne voyait
 * plus.
 *
 * Et changer d'écran ne déplaçait pas le focus : dans une application d'une
 * seule page, rien n'annonce alors le nouvel écran, et la tabulation suivante
 * repart d'un endroit qui n'existe plus.
 */
// Sélecteurs distincts : deux composants sans sélecteur produisent le même
// identifiant interne, et Angular refuse la collision.
@Component({ selector: 'app-page-a', template: 'A' })
class PageA {}
@Component({ selector: 'app-page-b', template: 'B' })
class PageB {}

describe('ShellComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        provideRouter([
          { path: 'a', component: PageA },
          { path: 'b', component: PageB },
        ]),
        { provide: AbonnesService, useValue: { startCacheSync: vi.fn() } },
        {
          provide: NotificationsService,
          useValue: {
            load: vi.fn().mockResolvedValue(undefined),
            unreadCount: () => 0,
            notifications: () => [],
          },
        },
        // La barre latérale et les onglets tirent des données ; le shell lui-même
        // n'en a pas besoin, mais ses enfants sont rendus avec lui.
        { provide: Apollo, useValue: { query: vi.fn(), watchQuery: vi.fn(), mutate: vi.fn(), subscribe: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return {
      fixture,
      layout: TestBed.inject(LayoutService),
      router: TestBed.inject(Router),
      main: () => fixture.nativeElement.querySelector('#contenu') as HTMLElement,
    };
  }

  // ── Le tiroir ────────────────────────────────────────────────────────────

  it('Échap referme le tiroir ouvert', () => {
    const { fixture, layout } = setup();
    layout.openMenu();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(layout.menuOpen()).toBe(false);
  });

  it('Échap ne fait rien quand le tiroir est déjà fermé', () => {
    // Une touche qui agit alors qu'il n'y a rien à fermer finit par agir sur
    // autre chose : ici, elle doit être sans effet.
    const { layout } = setup();
    expect(layout.menuOpen()).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(layout.menuOpen()).toBe(false);
  });

  it('le contenu devient inerte quand le tiroir s’ouvre', () => {
    const { fixture, layout, main } = setup();
    expect(main().hasAttribute('inert')).toBe(false);

    layout.openMenu();
    fixture.detectChanges();
    expect(main().hasAttribute('inert')).toBe(true);
  });

  it('et redevient atteignable à la fermeture', () => {
    const { fixture, layout, main } = setup();
    layout.openMenu();
    fixture.detectChanges();
    layout.closeMenu();
    fixture.detectChanges();
    expect(main().hasAttribute('inert')).toBe(false);
  });

  // ── Le focus après navigation ────────────────────────────────────────────

  it('le contenu principal est atteignable par programme', () => {
    // `tabindex="-1"` est ce qui permet au lien d'évitement et à la navigation
    // d'y poser le focus ; sans lui, les deux échouent en silence.
    const { main } = setup();
    expect(main().getAttribute('tabindex')).toBe('-1');
  });

  it('naviguer referme le tiroir', async () => {
    const { fixture, layout, router } = setup();
    layout.openMenu();
    fixture.detectChanges();

    await router.navigate(['/a']);
    fixture.detectChanges();
    expect(layout.menuOpen()).toBe(false);
  });

  it('le lien d’évitement pointe sur le contenu', () => {
    // Il est le premier élément focusable de la page : c'est sa raison d'être.
    const { fixture, main } = setup();
    const lien = fixture.nativeElement.querySelector('.shell__skip') as HTMLAnchorElement;
    expect(lien).toBeTruthy();
    expect(lien.getAttribute('href')).toBe('#contenu');
    expect(main().id).toBe('contenu');
  });
});
