import { TestBed } from '@angular/core/testing';
import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(LayoutService);
  }

  it('le menu est fermé par défaut', () => {
    expect(setup().menuOpen()).toBe(false);
  });

  it('openMenu() ouvre le menu', () => {
    const s = setup();
    s.openMenu();
    expect(s.menuOpen()).toBe(true);
  });

  it('closeMenu() referme le menu', () => {
    const s = setup();
    s.openMenu();
    s.closeMenu();
    expect(s.menuOpen()).toBe(false);
  });

  it('closeMenu() est un no-op si déjà fermé', () => {
    const s = setup();
    s.closeMenu();
    expect(s.menuOpen()).toBe(false);
  });

  it('toggleMenu() bascule l’état à chaque appel', () => {
    const s = setup();
    s.toggleMenu();
    expect(s.menuOpen()).toBe(true);
    s.toggleMenu();
    expect(s.menuOpen()).toBe(false);
    s.toggleMenu();
    expect(s.menuOpen()).toBe(true);
  });
});
