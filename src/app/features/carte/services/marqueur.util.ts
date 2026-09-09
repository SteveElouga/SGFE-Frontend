import { abonneStatutTone } from '../../../shared/models/abonne.model';
import type { CompteurGeoPoint } from '../carte.model';

/**
 * Élément DOM d'un repère de compteur, passé à `new maplibregl.Marker({ element })`.
 * Fonction pure (aucune dépendance à MapLibre) — testable et testée sans
 * charger la bibliothèque, et réutilisable si l'écran change un jour de
 * moteur de carte.
 *
 * Badge arrondi, 4 derniers chiffres du numéro de compteur (mission), couleur
 * selon le statut de l'abonné rattaché — `abonneStatutTone`, la même
 * correspondance que `StatusBadgeComponent` (cohérence avec le reste de
 * l'app : pas de palette inventée ici).
 */
export function creerElementMarqueur(point: CompteurGeoPoint): HTMLElement {
  const el = document.createElement('div');
  const tone = abonneStatutTone(point.statut);
  el.className = `carte-marqueur carte-marqueur--${tone}`;
  el.textContent = derniers4Chiffres(point.numeroCompteur);
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute(
    'aria-label',
    `Compteur ${point.numeroCompteur}, ${point.quartier}, statut ${point.statut}`,
  );
  return el;
}

/** 4 derniers chiffres du numéro de compteur, complétés à gauche par des zéros
 *  si le numéro en compte moins (mission : « badge arrondi avec les 4
 *  derniers chiffres du numéro de compteur »). */
export function derniers4Chiffres(numeroCompteur: number): string {
  return String(Math.trunc(Math.abs(numeroCompteur))).slice(-4).padStart(4, '0');
}
