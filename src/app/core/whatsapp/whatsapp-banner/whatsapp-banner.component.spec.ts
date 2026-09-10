import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { WhatsappBannerComponent } from './whatsapp-banner.component';
import { WhatsappSurveillanceService } from '../whatsapp-surveillance.service';

/**
 * jsdom n'implémente pas `ResizeObserver` (voir la garde
 * `typeof ResizeObserver === 'undefined'` dans le composant) : ce faux
 * observateur le fournit pour les tests, en gardant la main sur le callback
 * pour simuler une mesure — jsdom ne calcule de toute façon pas de mise en
 * page réelle, la valeur mesurée est donc fournie par le test, pas lue du DOM.
 */
class FauxResizeObserver {
  static dernier?: FauxResizeObserver;
  observe = () => {};
  disconnect = () => {};
  constructor(readonly callback: ResizeObserverCallback) {
    FauxResizeObserver.dernier = this;
  }
  declencher(height: number): void {
    this.callback(
      [{ contentRect: { height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

function monter(rompu: boolean, depuis = '') {
  TestBed.configureTestingModule({
    imports: [WhatsappBannerComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({}),
      { provide: WhatsappSurveillanceService, useValue: { rompu: signal(rompu), depuis: signal(depuis) } },
    ],
  });
  const fixture = TestBed.createComponent(WhatsappBannerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('WhatsappBannerComponent', () => {
  it('ne rend rien tant que la liaison n’est pas rompue', () => {
    const fixture = monter(false);
    expect(fixture.nativeElement.querySelector('.wa-banniere')).toBeNull();
  });

  it('affiche le bandeau, avec la durée quand elle est connue', () => {
    const fixture = monter(true, '25 min');
    const el = fixture.nativeElement.querySelector('.wa-banniere');
    expect(el).not.toBeNull();
    expect(el.querySelector('.wa-banniere__depuis')).not.toBeNull();
  });

  it('n’affiche pas la durée tant qu’elle est inconnue', () => {
    const fixture = monter(true, '');
    const el = fixture.nativeElement.querySelector('.wa-banniere');
    expect(el.querySelector('.wa-banniere__depuis')).toBeNull();
  });

  it('propose un lien vers Configuration pour reconnecter', () => {
    const fixture = monter(true);
    const lien = fixture.nativeElement.querySelector('.wa-banniere__action');
    expect(lien.getAttribute('href')).toBe('/configuration');
  });

  describe('variable CSS --wa-banniere-hauteur (pont vers .toast-stack)', () => {
    const original = globalThis.ResizeObserver;

    beforeEach(() => {
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = FauxResizeObserver;
    });

    afterEach(() => {
      document.documentElement.style.removeProperty('--wa-banniere-hauteur');
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = original;
    });

    it('publie la hauteur mesurée sur documentElement', () => {
      const fixture = monter(true);
      FauxResizeObserver.dernier?.declencher(64);
      fixture.detectChanges();

      expect(document.documentElement.style.getPropertyValue('--wa-banniere-hauteur')).toBe(
        '64px',
      );
    });

    it('publie 0px quand la mesure retombe à 0 (bandeau masqué)', () => {
      const fixture = monter(false);
      FauxResizeObserver.dernier?.declencher(0);
      fixture.detectChanges();

      expect(document.documentElement.style.getPropertyValue('--wa-banniere-hauteur')).toBe(
        '0px',
      );
    });

    it('remet la hauteur à 0px quand le composant est détruit', () => {
      const fixture = monter(true);
      FauxResizeObserver.dernier?.declencher(64);
      fixture.detectChanges();
      fixture.destroy();

      expect(document.documentElement.style.getPropertyValue('--wa-banniere-hauteur')).toBe(
        '0px',
      );
    });
  });
});
