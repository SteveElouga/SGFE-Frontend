/**
 * Le calcul du replacement des toasts, isolé du DOM.
 *
 * La pile est une colonne flex : un nouveau toast s'insère en tête et pousse les
 * autres vers le bas, un toast qui disparaît laisse remonter ceux qui le
 * suivent. Aucune transition CSS ne s'applique à un déplacement causé par la
 * mise en page — ils sautent donc, ce qui se lit comme un défaut d'affichage
 * plutôt que comme un changement.
 *
 * La technique est celle du FLIP : retenir où chaque toast se trouvait, laisser
 * le navigateur recalculer, puis replacer visuellement chacun à son ancienne
 * position avant de l'en laisser glisser. Ce qu'on anime n'est qu'un
 * `transform` : le déplacement réel a déjà eu lieu, et rien ne recalcule la mise
 * en page pendant le mouvement.
 *
 * Ce fichier ne touche pas au DOM. Le calcul est la partie qui porte des
 * décisions — quel toast bouge, de combien, lequel on laisse tranquille — et
 * c'est elle qu'on veut pouvoir vérifier sans navigateur.
 */

/** Position verticale mesurée d'un toast. */
export interface PositionToast {
  id: string;
  haut: number;
}

/** Un toast à replacer, et l'écart à parcourir. */
export interface Replacement {
  id: string;
  /** Pixels dont l'élément doit repartir, positif vers le bas. */
  ecart: number;
}

/**
 * Sous ce seuil, le déplacement n'est pas perceptible et l'animer ne ferait
 * qu'ajouter du travail au compositeur à chaque rendu.
 */
const SEUIL_PX = 1;

/**
 * Compare deux relevés de positions et dit qui doit glisser, et de combien.
 *
 * Un toast dont on n'a pas de position antérieure est ignoré : il vient
 * d'apparaître, il a sa propre animation d'entrée, et lui inventer une ancienne
 * position le ferait surgir en glissant depuis un point arbitraire.
 */
export function calculerReplacements(
  precedentes: ReadonlyMap<string, number>,
  actuelles: readonly PositionToast[],
): Replacement[] {
  const out: Replacement[] = [];
  for (const { id, haut } of actuelles) {
    const avant = precedentes.get(id);
    if (avant === undefined) continue;
    const ecart = avant - haut;
    if (Math.abs(ecart) < SEUIL_PX) continue;
    out.push({ id, ecart });
  }
  return out;
}

/**
 * Remplace la table des positions par le relevé courant.
 *
 * Les toasts disparus en sortent : sur une session longue, les garder ferait
 * grossir la table sans fin, et un identifiant réutilisé hériterait d'une place
 * qui n'a plus de sens.
 */
export function memoriserPositions(
  table: Map<string, number>,
  actuelles: readonly PositionToast[],
): void {
  table.clear();
  for (const { id, haut } of actuelles) table.set(id, haut);
}
