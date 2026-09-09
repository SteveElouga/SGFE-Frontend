import { Injectable } from '@angular/core';
import { distanceHaversineKm, dureeEstimeeMin, type LatLng } from '../../../shared/utils/geo.utils';
import type { ResultatItineraire } from '../carte.model';

/** Au-delà de ce délai, on abandonne OSRM et on bascule sur l'estimation —
 *  un agent sur le terrain avec un réseau instable ne doit pas attendre
 *  indéfiniment un itinéraire qui ne viendra pas. */
const TIMEOUT_OSRM_MS = 6000;

/**
 * Service public OSRM (aucune clé requise) — voir la mission : « Tente un vrai
 * appel à … ; si l'appel échoue (réseau, timeout, erreur), calcule et affiche
 * une estimation à vol d'oiseau ». `overview=full` + `geometries=geojson`
 * pour récupérer directement des paires `[lon, lat]` exploitables par
 * MapLibre, sans décoder de polyligne.
 */
function urlOsrm(origine: LatLng, destination: LatLng): string {
  return (
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origine.lon},${origine.lat};${destination.lon},${destination.lat}` +
    `?overview=full&geometries=geojson`
  );
}

interface ReponseOsrm {
  routes?: Array<{
    distance: number; // mètres
    duration: number; // secondes
    geometry: { coordinates: [number, number][] };
  }>;
}

@Injectable({ providedIn: 'root' })
export class ItineraireService {
  /**
   * Calcule l'itinéraire entre `origine` et `destination`. Ne rejette
   * jamais : en cas d'échec réseau/timeout/réponse invalide, retombe sur une
   * estimation Haversine (`estimation: true`) plutôt que de propager
   * l'erreur — l'écran doit toujours pouvoir afficher quelque chose.
   */
  async calculer(origine: LatLng, destination: LatLng): Promise<ResultatItineraire> {
    try {
      return await this.calculerOsrm(origine, destination);
    } catch {
      return this.estimerAVolDoiseau(origine, destination);
    }
  }

  private async calculerOsrm(origine: LatLng, destination: LatLng): Promise<ResultatItineraire> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_OSRM_MS);
    try {
      const reponse = await fetch(urlOsrm(origine, destination), { signal: controller.signal });
      if (!reponse.ok) throw new Error(`OSRM a répondu ${reponse.status}`);
      const data = (await reponse.json()) as ReponseOsrm;
      const route = data.routes?.[0];
      if (!route) throw new Error('OSRM : aucun itinéraire trouvé');
      return {
        distanceKm: route.distance / 1000,
        dureeMin: route.duration / 60,
        geometrie: route.geometry.coordinates,
        estimation: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private estimerAVolDoiseau(origine: LatLng, destination: LatLng): ResultatItineraire {
    const distanceKm = distanceHaversineKm(origine, destination);
    return {
      distanceKm,
      dureeMin: dureeEstimeeMin(distanceKm),
      geometrie: [
        [origine.lon, origine.lat],
        [destination.lon, destination.lat],
      ],
      estimation: true,
    };
  }
}
