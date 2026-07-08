import { effect, type Injector } from '@angular/core';
import type { InMemoryCache } from '@apollo/client/core';
import type { AuthService } from '../auth/auth.service';

/**
 * Persistance du cache Apollo → consultation **hors ligne** des données déjà
 * vues (dashboard, listes…). Implémentation maison volontairement légère :
 * `cache.extract()` / `cache.restore()` (API stable Apollo Client 3 et 4), sans
 * dépendance externe. Le service worker cache la coquille de l'app ; ceci
 * complète en cachant les **données** GraphQL.
 *
 * Sécurité : la clé contient des données de facturation → elle est **purgée à la
 * déconnexion** (voir `setupLogoutPurge`).
 */
const STORAGE_KEY = 'aquabill.apollo-cache';

/** Restaure le cache persistant. Best-effort : sur données corrompues, on repart propre. */
export function restorePersistedCache(cache: InMemoryCache): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) cache.restore(JSON.parse(raw));
  } catch {
    purgePersistedCache();
  }
}

/**
 * Sauvegarde l'état du cache quand l'utilisateur **quitte ou masque** l'app
 * (fermeture d'onglet, bascule d'appli mobile). Suffisant pour l'offline sans
 * surcoût d'écriture à chaque requête.
 */
export function setupCachePersistence(cache: InMemoryCache): void {
  const save = (): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache.extract()));
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

/**
 * Purge à la déconnexion, **sans coupler** ce module à `AuthService.clearSession`
 * (fichier édité en parallèle) : on observe la transition **authentifié →
 * déconnecté** via un effet sur le signal `user`. L'état initial « pas encore
 * connecté » (null au démarrage) ne déclenche PAS de purge.
 */
export function setupLogoutPurge(auth: AuthService, injector: Injector): void {
  let wasAuthed = false;
  effect(
    () => {
      const user = auth.user();
      if (user) {
        wasAuthed = true;
      } else if (wasAuthed) {
        wasAuthed = false;
        purgePersistedCache();
      }
    },
    { injector },
  );
}
