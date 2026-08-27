import type { InMemoryCache } from '@apollo/client/core';
import {
  purgePersistedCache,
  restorePersistedCacheFor,
  setupCachePersistence,
} from './apollo-persistence';
import type { AuthService } from '../auth/auth.service';

/**
 * Le cache persisté est la source de vérité la plus tenace de l'application :
 * il vit dans `localStorage`, il est prioritaire, et il est hors de portée de
 * tout ce qu'un utilisateur peut tenter depuis son navigateur — Ctrl+Maj+R vide
 * la mémoire et le cache HTTP, pas le stockage local.
 *
 * C'est ce qui faisait survivre « 17 abonnés » à une recharge forcée. Ces tests
 * verrouillent les deux garde-fous qui l'empêchent de faire foi : une borne
 * d'âge et une estampille de version.
 */

const CLE = 'aquabill.apollo-cache';

/**
 * jsdom, tel que configuré par le runner, ne fournit pas `localStorage` — son
 * document a une origine opaque, où l'API n'existe pas.
 *
 * Ce n'est pas un détail d'outillage : le module sous test enveloppe chacun de
 * ses accès dans un `try/catch`, si bien qu'en l'absence de `localStorage` il
 * ne fait simplement rien, sans bruit. Toute la couche de persistance était
 * donc intestable — et de fait jamais testée. C'est précisément là que s'était
 * logé le bug des « 17 abonnés ».
 *
 * On installe donc un double en mémoire, conforme à l'interface Storage.
 */
function installerStockage(): void {
  const contenu = new Map<string, string>();
  const faux: Storage = {
    get length() { return contenu.size; },
    clear: () => contenu.clear(),
    getItem: (k) => (contenu.has(k) ? contenu.get(k)! : null),
    key: (i) => [...contenu.keys()][i] ?? null,
    removeItem: (k) => void contenu.delete(k),
    setItem: (k, v) => void contenu.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { value: faux, configurable: true });
}

function cacheFactice() {
  return {
    restore: vi.fn(),
    extract: vi.fn().mockReturnValue({ ROOT_QUERY: {} }),
  } as unknown as InMemoryCache & { restore: ReturnType<typeof vi.fn> };
}

function ecrire(payload: Record<string, unknown>) {
  window.localStorage.setItem(CLE, JSON.stringify(payload));
}

describe('persistance du cache Apollo', () => {
  beforeEach(() => installerStockage());

  it('restaure un cache récent du bon utilisateur', () => {
    ecrire({ userId: 'u1', data: { ROOT_QUERY: {} }, sauvegardeLe: Date.now(), version: 2 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).toHaveBeenCalled();
  });

  it('écarte un cache plus vieux que douze heures', () => {
    const treizeHeures = Date.now() - 13 * 60 * 60 * 1000;
    ecrire({ userId: 'u1', data: {}, sauvegardeLe: treizeHeures, version: 2 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CLE)).toBeNull();
  });

  it('écarte un cache sans horodatage — il vient d’avant la borne d’âge', () => {
    ecrire({ userId: 'u1', data: {}, version: 2 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).not.toHaveBeenCalled();
  });

  it('écarte un cache d’une version antérieure du schéma', () => {
    ecrire({ userId: 'u1', data: {}, sauvegardeLe: Date.now(), version: 1 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).not.toHaveBeenCalled();
  });

  it('écarte un horodatage venu du futur — une horloge déréglée n’ouvre pas la porte', () => {
    ecrire({ userId: 'u1', data: {}, sauvegardeLe: Date.now() + 60_000, version: 2 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).not.toHaveBeenCalled();
  });

  it('ne restaure jamais le cache d’un autre utilisateur, et le purge', () => {
    ecrire({ userId: 'u2', data: {}, sauvegardeLe: Date.now(), version: 2 });
    const cache = cacheFactice();
    restorePersistedCacheFor(cache, 'u1');
    expect(cache.restore).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CLE)).toBeNull();
  });

  /**
   * Récupère le gestionnaire posé sur `pagehide` plutôt que de diffuser
   * l'événement : chaque `setupCachePersistence` en ajoute un et aucun n'est
   * retiré, si bien qu'un `dispatchEvent` réveille aussi ceux des tests
   * précédents — et la sauvegarde d'un utilisateur authentifié écraserait le
   * cas qu'on cherche justement à vérifier.
   */
  function poserPersistance(auth: AuthService) {
    const cache = cacheFactice();
    let sauvegarder: (() => void) | null = null;
    const espion = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type, handler) => {
        if (type === 'pagehide') sauvegarder = handler as () => void;
      });
    setupCachePersistence(cache, auth);
    espion.mockRestore();
    return { cache, sauvegarder: () => sauvegarder?.() };
  }

  it('estampille ce qu’il écrit — sinon la borne d’âge ne servirait à rien', () => {
    const { sauvegarder } = poserPersistance({ user: () => ({ id: 'u1' }) } as unknown as AuthService);

    sauvegarder();

    const ecrit = JSON.parse(window.localStorage.getItem(CLE)!);
    expect(ecrit.userId).toBe('u1');
    expect(ecrit.version).toBe(2);
    expect(typeof ecrit.sauvegardeLe).toBe('number');
    expect(Date.now() - ecrit.sauvegardeLe).toBeLessThan(5_000);
  });

  it('ne persiste rien pour un visiteur non authentifié', () => {
    const { sauvegarder } = poserPersistance({ user: () => null } as unknown as AuthService);
    sauvegarder();
    expect(window.localStorage.getItem(CLE)).toBeNull();
  });

  it('un cache estampillé aujourd’hui est relu demain matin — pas trois jours après', () => {
    const { sauvegarder } = poserPersistance({ user: () => ({ id: 'u1' }) } as unknown as AuthService);
    sauvegarder();
    const ecrit = JSON.parse(window.localStorage.getItem(CLE)!);

    // Onze heures plus tard : le cache sert encore à peindre l'écran.
    window.localStorage.setItem(CLE, JSON.stringify({ ...ecrit, sauvegardeLe: Date.now() - 11 * 3600_000 }));
    const c1 = cacheFactice();
    restorePersistedCacheFor(c1, 'u1');
    expect(c1.restore).toHaveBeenCalled();

    // Treize heures plus tard : il ne représente plus rien.
    window.localStorage.setItem(CLE, JSON.stringify({ ...ecrit, sauvegardeLe: Date.now() - 13 * 3600_000 }));
    const c2 = cacheFactice();
    restorePersistedCacheFor(c2, 'u1');
    expect(c2.restore).not.toHaveBeenCalled();
  });

  it('purge sur demande', () => {
    ecrire({ userId: 'u1', data: {}, sauvegardeLe: Date.now(), version: 2 });
    purgePersistedCache();
    expect(window.localStorage.getItem(CLE)).toBeNull();
  });
});
