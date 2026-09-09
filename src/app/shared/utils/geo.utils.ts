/**
 * Géométrie plane sur la sphère terrestre — utilisée par l'écran Carte pour
 * l'estimation « à vol d'oiseau » quand l'itinéraire routier (OSRM) est
 * indisponible (réseau, timeout, erreur serveur).
 */

export interface LatLng {
  lat: number;
  lon: number;
}

const RAYON_TERRE_KM = 6371;

/**
 * Distance à vol d'oiseau entre deux points, en kilomètres (formule de
 * Haversine). Ne suppose rien du réseau routier — c'est précisément pourquoi
 * elle sert de repli : elle ne peut pas échouer comme un appel réseau.
 */
export function distanceHaversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Vitesse moyenne retenue pour convertir une distance à vol d'oiseau en une
 *  durée plausible en zone urbaine/périurbaine camerounaise — un ordre de
 *  grandeur, pas une prédiction : c'est annoncé comme une estimation partout
 *  où cette fonction est utilisée. */
const VITESSE_ESTIMEE_KMH = 30;

/** Durée estimée (minutes) à partir d'une distance (km), à `VITESSE_ESTIMEE_KMH`. */
export function dureeEstimeeMin(distanceKm: number): number {
  return (distanceKm / VITESSE_ESTIMEE_KMH) * 60;
}
