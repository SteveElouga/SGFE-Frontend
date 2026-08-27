/**
 * Désambiguïsation des campagnes homonymes.
 *
 * Deux campagnes peuvent porter le même nom — « Août 2026 » ouverte deux fois,
 * par exemple. `/campagnes` les affichait alors strictement identiques, même
 * date planifiée comprise, et `/rapports` les suffixait d'un fragment d'UUID :
 * deux écrans, deux traitements du même problème, dont l'un montrait de la
 * plomberie à un comptable.
 *
 * On suffixe désormais par la **date de création**, qui distingue réellement
 * deux campagnes du même mois et se lit sans explication.
 */

/** Suffixe humain d'une campagne : sa date de création, ou `null` si illisible. */
export function suffixeCampagne(
  dateCreation: string | null | undefined,
  lang: string,
): string | null {
  if (!dateCreation) return null;
  const d = new Date(dateCreation);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Nom affichable d'une campagne, suffixé seulement s'il est ambigu.
 *
 * `nbHomonymes` est le nombre de campagnes portant ce nom dans la liste
 * courante — à 1, le nom se suffit à lui-même et on ne l'alourdit pas.
 *
 * `replisurId` n'est utilisé que si la date manque : c'est le cas des lignes
 * du read-model Reporting qui référencent une campagne disparue. Le fragment
 * d'identifiant y devient une information — « cette ligne est orpheline » —
 * au lieu d'être du bruit.
 */
export function nomCampagneAffichable(params: {
  nom: string;
  dateCreation?: string | null;
  nbHomonymes: number;
  lang: string;
  replisurId?: string | null;
}): string {
  const { nom, dateCreation, nbHomonymes, lang, replisurId } = params;
  if (nbHomonymes <= 1) return nom;

  const date = suffixeCampagne(dateCreation, lang);
  if (date) return `${nom} · créée le ${date}`;
  return replisurId ? `${nom} · ${replisurId.slice(0, 6)}` : nom;
}
