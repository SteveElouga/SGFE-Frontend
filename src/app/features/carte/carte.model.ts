import type { StatutAbonne } from '../../shared/models/abonne.model';

/**
 * Compteur géolocalisé, prêt à être posé sur la carte.
 *
 * Contrat présentationnel, **pas** une vue générée (`graphql/vues.ts`) : il
 * regroupe des champs venus de `AbonneLigne` (`graphql/vues.ts`, alimentée par
 * `GET_ABONNES`/`ABONNE_LIST_FIELDS`, qui portent bien
 * `latitude`/`longitude`/`dateMajPosition` depuis la PR backend #243) sous une
 * forme pensée pour le rendu (un point par compteur géolocalisé, pas par
 * abonné). Voir `CarteService.toGeoPoint` pour le mapping.
 */
export interface CompteurGeoPoint {
  /** Id de l'abonné (clé de sélection partagée avec la liste). */
  abonneId: string;
  numeroCompteur: number;
  quartier: string;
  statut: StatutAbonne;
  latitude: number;
  longitude: number;
  /** ISO 8601, ou `null` si jamais renseignée côté serveur. */
  dateMajPosition: string | null;
}

/** Statut détecté côté client pour une ligne du CSV d'import, avant tout envoi. */
export type StatutLigneImport = 'A_IMPORTER' | 'FORMAT_INVALIDE';

export interface LigneImportCoordonnees {
  /** Numéro de ligne dans le fichier (1-based, hors en-tête) — pour l'affichage. */
  ligne: number;
  numeroCompteurBrut: string;
  latitudeBrut: string;
  longitudeBrut: string;
  statut: StatutLigneImport;
  /** Raison du format invalide (vide si `A_IMPORTER`). */
  erreur: string;
}

export interface ResultatItineraire {
  distanceKm: number;
  dureeMin: number;
  /** Paires `[longitude, latitude]`, ordre GeoJSON — ce que MapLibre attend. */
  geometrie: [number, number][];
  /** `true` : repli Haversine (ligne pointillée, à annoncer comme estimation).
   *  `false` : itinéraire routier réel (OSRM). */
  estimation: boolean;
}
