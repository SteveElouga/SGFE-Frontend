/**
 * Composition du nom affiché d'un abonné — **source unique**.
 *
 * Avant ce module, la même personne s'affichait dans trois ordres différents
 * selon l'écran (`campagne-detail` en utilisait deux à lui seul : `prénom nom`
 * en tableau, `nom prénom` en carte mobile).
 *
 * L'ordre retenu est **prénom puis nom**, celui que la gateway applique déjà
 * pour composer `Facture.abonneNom` — un champ que le frontend reçoit tel quel
 * et ne peut pas recomposer. S'aligner dessus est le seul moyen qu'un abonné
 * porte le même nom sur la liste des abonnés et sur sa facture.
 */
export function nomAbonne(prenom?: string | null, nom?: string | null): string {
  return [prenom, nom]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Nom à afficher pour une ligne qui vient de la gateway (facture, paiement) :
 * le nom composé s'il existe, sinon le numéro d'abonné, sinon un tiret cadratin.
 *
 * Les factures issues du seed de démo référencent des abonnés inexistants et
 * reviennent avec un nom vide : mieux vaut afficher `AB-0016` qu'une case vide,
 * et un tiret explicite qu'un blanc qu'on prend pour un défaut d'affichage.
 */
export function nomAbonneOuReference(
  nomCompose?: string | null,
  numeroAbonne?: string | null,
): string {
  const n = (nomCompose ?? '').trim();
  if (n) return n;
  const ref = (numeroAbonne ?? '').trim();
  return ref || '—';
}
