import type { LigneImportCoordonnees } from '../carte.model';

/**
 * Colonnes attendues (minimum) : `numero_compteur,latitude,longitude`.
 * Tolérant à l'ordre des colonnes et à la casse de l'en-tête ; pas tolérant
 * aux champs entre guillemets (hors périmètre pour un CSV de 3 colonnes
 * numériques).
 */
const COLONNES = ['numero_compteur', 'latitude', 'longitude'] as const;

function normaliserEntete(cellule: string): string {
  return cellule.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Repère l'index de chaque colonne attendue dans une ligne d'en-tête ; `null`
 *  si la ligne ne ressemble pas à un en-tête (aucune des 3 colonnes trouvée) —
 *  dans ce cas on suppose l'ordre par défaut et on traite la première ligne
 *  comme une donnée. */
function indexColonnes(premiereLigne: string[]): Record<(typeof COLONNES)[number], number> | null {
  const normalisees = premiereLigne.map(normaliserEntete);
  const trouve: Partial<Record<(typeof COLONNES)[number], number>> = {};
  for (const col of COLONNES) {
    const idx = normalisees.indexOf(col);
    if (idx !== -1) trouve[col] = idx;
  }
  if (Object.keys(trouve).length === 0) return null;
  return {
    numero_compteur: trouve.numero_compteur ?? 0,
    latitude: trouve.latitude ?? 1,
    longitude: trouve.longitude ?? 2,
  };
}

/**
 * Numéro de compteur : un entier, jamais une chaîne — c'est le type réel de
 * `Compteur.numeroCompteur` côté gateway (`Int!`), une distinction que le CSV
 * (texte brut) ne porte pas. Le mapping d'import prend `String` en entrée
 * (le serveur le reparse pour dégrader gracieusement ligne par ligne), mais
 * rien n'empêche le client de refuser tout de suite ce qui ne pourra de toute
 * façon jamais être reparsé en entier — inutile d'attendre la réponse serveur
 * pour une valeur qui ne convertira jamais.
 */
function numeroCompteurValide(brut: string): boolean {
  return /^\d+$/.test(brut.trim());
}

function latitudeValide(brut: string): boolean {
  const n = Number.parseFloat(brut.trim());
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function longitudeValide(brut: string): boolean {
  const n = Number.parseFloat(brut.trim());
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/**
 * Parse un CSV de coordonnées côté client, AVANT tout envoi au serveur —
 * chaque ligne porte son propre statut détecté localement (`A_IMPORTER` /
 * `FORMAT_INVALIDE`), pour l'aperçu exigé par la mission. Ne lève jamais :
 * un fichier vide ou sans ligne exploitable renvoie simplement `[]`.
 */
export function parserCsvCoordonnees(contenu: string): LigneImportCoordonnees[] {
  const lignesBrutes = contenu
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lignesBrutes.length === 0) return [];

  const cellules = lignesBrutes.map((l) => l.split(','));
  const colonnes = indexColonnes(cellules[0]);
  const aUnEntete = colonnes !== null;
  const cols = colonnes ?? { numero_compteur: 0, latitude: 1, longitude: 2 };
  const donnees = aUnEntete ? cellules.slice(1) : cellules;
  const decalageLigne = aUnEntete ? 1 : 0;

  return donnees.map((champs, i) => {
    const numeroCompteurBrut = (champs[cols.numero_compteur] ?? '').trim();
    const latitudeBrut = (champs[cols.latitude] ?? '').trim();
    const longitudeBrut = (champs[cols.longitude] ?? '').trim();

    const erreurs: string[] = [];
    if (!numeroCompteurValide(numeroCompteurBrut)) {
      erreurs.push('numéro de compteur non entier');
    }
    if (!latitudeValide(latitudeBrut)) {
      erreurs.push('latitude hors de [-90, 90]');
    }
    if (!longitudeValide(longitudeBrut)) {
      erreurs.push('longitude hors de [-180, 180]');
    }

    return {
      ligne: i + 1 + decalageLigne,
      numeroCompteurBrut,
      latitudeBrut,
      longitudeBrut,
      statut: erreurs.length === 0 ? 'A_IMPORTER' : 'FORMAT_INVALIDE',
      erreur: erreurs.join(', '),
    };
  });
}
