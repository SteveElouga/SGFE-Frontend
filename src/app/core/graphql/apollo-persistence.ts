import type { InMemoryCache } from '@apollo/client/core';
import type { AuthService } from '../auth/auth.service';

/**
 * Persistance du cache Apollo → consultation **hors ligne** des données déjà
 * vues (dashboard, listes…). Implémentation maison volontairement légère :
 * `cache.extract()` / `cache.restore()` (API stable Apollo Client 3 et 4), sans
 * dépendance externe. Le service worker cache la coquille de l'app ; ceci
 * complète en cachant les **données** GraphQL.
 *
 * Ce cache **peint**, il ne fait pas foi. Les requêtes le revalident
 * systématiquement (voir la politique dans `apollo.config.ts`) et il est écarté
 * passé un certain âge. Sans ces deux garde-fous, il devenait la source de
 * vérité la plus tenace de l'application : invisible, prioritaire, et hors de
 * portée de tout ce qu'un utilisateur peut faire depuis son navigateur.
 *
 * Sécurité : la clé contient des données de facturation (montants, soldes). Elle
 * est **rattachée au `userId`** et n'est restaurée que pour ce même utilisateur
 * (voir `restorePersistedCacheFor`) — sur un appareil partagé, les données de A
 * ne peuvent jamais être servies à B. Elle est en outre purgée à la déconnexion
 * (voir `AuthService.clearSession`).
 */
const STORAGE_KEY = 'aquabill.apollo-cache';

/**
 * Âge au-delà duquel un cache persisté n'est plus restauré du tout.
 *
 * Le cache servait à peindre l'écran instantanément au retour de l'utilisateur.
 * Sans borne d'âge, il peignait aussi bien l'état d'il y a trois jours — et
 * comme il vit dans `localStorage`, une recharge forcée du navigateur ne le
 * corrigeait pas : Ctrl+Maj+R vide la mémoire et le cache HTTP, pas le stockage
 * local. C'est ce qui faisait survivre « 17 abonnés » à tout ce que
 * l'utilisateur pouvait tenter depuis son navigateur.
 *
 * Douze heures couvrent le cas qui justifie la persistance — reprendre le
 * travail après une pause, une nuit, un trajet — sans couvrir celui où plus
 * rien de ce qui est affiché n'a de rapport avec la réalité.
 */
const AGE_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * Estampille de version du schéma de cache. La changer invalide d'un coup tous
 * les caches persistés du parc : indispensable quand la forme des données
 * change, sinon un poste restaure des objets que le code ne sait plus lire.
 */
const VERSION_CACHE = 2;

interface PersistedCache {
  userId: string;
  data: unknown;
  /** Millisecondes epoch au moment de la sauvegarde. */
  sauvegardeLe?: number;
  version?: number;
}

function readPersisted(): PersistedCache | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCache>;
    if (!parsed || typeof parsed.userId !== 'string' || !('data' in parsed)) return null;
    // Un cache d'une version antérieure du schéma est illisible par construction.
    if (parsed.version !== VERSION_CACHE) return null;
    // Un cache trop vieux n'est pas un raccourci, c'est un mensonge.
    const age = Date.now() - (parsed.sauvegardeLe ?? 0);
    if (!Number.isFinite(age) || age < 0 || age > AGE_MAX_MS) return null;
    return parsed as PersistedCache;
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
      const payload: PersistedCache = {
        userId: user.id,
        data: cache.extract(),
        sauvegardeLe: Date.now(),
        version: VERSION_CACHE,
      };
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
