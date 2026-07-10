import type { InMemoryCache } from '@apollo/client/core';
import type { AuthService } from '../auth/auth.service';

/**
 * Persistance du cache Apollo → consultation **hors ligne** des données déjà
 * vues (dashboard, listes…). Implémentation maison volontairement légère :
 * `cache.extract()` / `cache.restore()` (API stable Apollo Client 3 et 4), sans
 * dépendance externe. Le service worker cache la coquille de l'app ; ceci
 * complète en cachant les **données** GraphQL.
 *
 * Sécurité : la clé contient des données de facturation (montants, soldes). Elle
 * est **rattachée au `userId`** et n'est restaurée que pour ce même utilisateur
 * (voir `restorePersistedCacheFor`) — sur un appareil partagé, les données de A
 * ne peuvent jamais être servies à B. Elle est en outre purgée à la déconnexion
 * (voir `AuthService.clearSession`).
 */
const STORAGE_KEY = 'aquabill.apollo-cache';

interface PersistedCache {
  userId: string;
  data: unknown;
}

function readPersisted(): PersistedCache | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCache>;
    if (parsed && typeof parsed.userId === 'string' && 'data' in parsed) {
      return parsed as PersistedCache;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Restaure le cache persistant **uniquement s'il appartient à l'utilisateur
 * courant**. Tout cache appartenant à un autre utilisateur (ou illisible) est
 * purgé au lieu d'être chargé — empêche la fuite de données inter-utilisateurs
 * sur un appareil partagé.
 */
export function restorePersistedCacheFor(cache: InMemoryCache, userId: string): void {
  const persisted = readPersisted();
  if (!persisted || persisted.userId !== userId) {
    purgePersistedCache();
    return;
  }
  try {
    cache.restore(persisted.data as Parameters<InMemoryCache['restore']>[0]);
  } catch {
    purgePersistedCache();
  }
}

/**
 * Sauvegarde l'état du cache quand l'utilisateur **quitte ou masque** l'app
 * (fermeture d'onglet, bascule d'appli mobile). Le cache n'est persisté que
 * lorsqu'un utilisateur est authentifié, et toujours estampillé de son `userId`
 * pour un rechargement strictement rattaché à la bonne identité.
 */
export function setupCachePersistence(cache: InMemoryCache, auth: AuthService): void {
  const save = (): void => {
    const user = auth.user();
    if (!user) return; // ne jamais persister un état anonyme / non authentifié
    try {
      const payload: PersistedCache = { userId: user.id, data: cache.extract() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota dépassé / mode privé — persistance simplement ignorée */
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}

/** Efface les données persistées (clé sensible). */
export function purgePersistedCache(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
