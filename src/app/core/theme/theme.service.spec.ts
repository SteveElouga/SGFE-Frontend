import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

/**
 * Suit le système par défaut, avec une préférence manuelle persistée qui prend
 * le pas dessus. Pilote la classe `.p-dark` sur `<html>` (jetons PrimeNG +
 * application) via un `effect()`.
 */
describe('ThemeService', () => {
  const STORAGE_KEY = 'theme.preference';
  let matchMediaMock: (query: string) => MediaQueryList;
  let listeners: Array<(e: MediaQueryListEvent) => void>;

  // jsdom tel que configuré ici ne fournit pas `localStorage` (voir
  // auth.service.spec.ts / offline-saisie.service.spec.ts) : même double en mémoire.
  function installerStockage(): Map<string, string> {
    const contenu = new Map<string, string>();
    const faux: Storage = {
      get length() { return contenu.size; },
      clear: () => contenu.clear(),
      getItem: (k: string) => (contenu.has(k) ? contenu.get(k)! : null),
      key: (i: number) => [...contenu.keys()][i] ?? null,
      removeItem: (k: string) => void contenu.delete(k),
      setItem: (k: string, v: string) => void contenu.set(k, String(v)),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: faux });
    return contenu;
  }

  function setup(preferenceStockee?: string) {
    document.documentElement.classList.remove('p-dark');
    const stockage = installerStockage();
    if (preferenceStockee !== undefined) stockage.set(STORAGE_KEY, preferenceStockee);
    listeners = [];
    matchMediaMock = vi.fn((query: string) => ({
      matches: query.includes('dark') ? systemePrefereSombre : false,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    })) as unknown as (query: string) => MediaQueryList;
    vi.stubGlobal('matchMedia', matchMediaMock);

    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeService);
  }

  let systemePrefereSombre = false;

  beforeEach(() => {
    systemePrefereSombre = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('p-dark');
  });

  it('préférence par défaut : "auto" quand rien n’est stocké', () => {
    const s = setup();
    expect(s.preference()).toBe('auto');
  });

  it('en "auto", suit le système clair', () => {
    systemePrefereSombre = false;
    const s = setup();
    expect(s.resolvedTheme()).toBe('light');
  });

  it('en "auto", suit le système sombre', () => {
    systemePrefereSombre = true;
    const s = setup();
    expect(s.resolvedTheme()).toBe('dark');
  });

  it('une préférence manuelle "dark" l’emporte sur un système clair', () => {
    systemePrefereSombre = false;
    const s = setup();
    s.setPreference('dark');
    expect(s.resolvedTheme()).toBe('dark');
  });

  it('une préférence manuelle "light" l’emporte sur un système sombre', () => {
    systemePrefereSombre = true;
    const s = setup();
    s.setPreference('light');
    expect(s.resolvedTheme()).toBe('light');
  });

  it('setPreference() persiste le choix en localStorage', () => {
    const s = setup();
    s.setPreference('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('relit une préférence stockée valide au démarrage', () => {
    const s = setup('dark');
    expect(s.preference()).toBe('dark');
  });

  it('une valeur stockée invalide retombe sur "auto"', () => {
    const s = setup('sepia');
    expect(s.preference()).toBe('auto');
  });

  it('pose la classe .p-dark sur <html> quand le thème résolu est sombre', () => {
    const s = setup();
    s.setPreference('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('p-dark')).toBe(true);
  });

  it('retire la classe .p-dark quand on repasse en clair', () => {
    const s = setup();
    s.setPreference('dark');
    TestBed.tick();
    s.setPreference('light');
    TestBed.tick();
    expect(document.documentElement.classList.contains('p-dark')).toBe(false);
  });

  it('un changement système en "auto" met à jour le thème résolu', () => {
    const s = setup();
    expect(s.resolvedTheme()).toBe('light');
    systemePrefereSombre = true;
    listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    expect(s.resolvedTheme()).toBe('dark');
  });

  it('un changement système est ignoré si une préférence manuelle est active', () => {
    const s = setup();
    s.setPreference('light');
    listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    expect(s.resolvedTheme()).toBe('light');
  });
});
