/**
 * Ce qu'un écran reçoit vraiment — nommé, et dérivé de la requête qui le remplit.
 *
 * Un modèle écrit à la main décrit le **schéma** : tout ce que le serveur
 * pourrait rendre. Une vue décrit la **sélection** : ce que cette requête-là
 * demande effectivement. La différence entre les deux est exactement l'espace
 * où trois fonctionnalités ont vécu sans jamais s'afficher.
 *
 * `facture.model.ts` déclarait `motifAnnulation?: string`. `GET_FACTURE` ne
 * demandait pas ce champ. `facture-detail.component.html` testait
 * `@if (f.motifAnnulation)`. Le compilateur voyait un champ optionnel dans une
 * interface, donc il se taisait ; la valeur était `undefined` à chaque
 * exécution, et le bandeau d'annulation n'a jamais pu apparaître. Le champ
 * optionnel absent de la requête et le champ optionnel réellement vide sont le
 * même type — c'est ça qui rend la panne muette.
 *
 * Avec une vue, ce n'est plus le même type : le champ n'existe pas, et le
 * gabarit ne compile pas. La panne devient une erreur de build.
 *
 * Le nom des vues suit l'usage, pas la requête : `FactureDetail` plutôt que
 * `GetFactureQuery['facture']`. L'écran lit son propre vocabulaire, et le jour
 * où la requête change de nom, un seul endroit bouge.
 *
 * Ces alias ne sont pas à écrire à la main : `generated.ts` est produit par
 * `npm run codegen` depuis l'instantané d'introspection, et
 * `npm run verify:codegen` échoue s'il a vieilli.
 */
import type {
  GetAbonneQuery,
  GetAbonnesQuery,
  GetAllEnvoisQuery,
  GetAllPaiementsQuery,
  GetCampagneQuery,
  GetCampagnesQuery,
  GetEnvoisQuery,
  GetFactureQuery,
  GetFacturesParCampagneQuery,
  GetFacturesQuery,
  GetImpayesQuery,
  GetPaiementsQuery,
  GetRelevesParAgentQuery,
  GetRelevesQuery,
  GetSoldeFactureQuery,
} from './generated';

/** Une facture vue par son écran de détail — la sélection la plus complète. */
export type FactureDetail = GetFactureQuery['facture'];

/** Une facture telle qu'une ligne de la liste globale la porte. */
export type FactureLigne = GetFacturesQuery['factures'][number];

/** Une facture telle que la liste d'une campagne la porte. */
export type FactureLigneCampagne = GetFacturesParCampagneQuery['facturesParCampagne'][number];

/** Une campagne vue par son écran de détail. */
export type CampagneDetail = GetCampagneQuery['campagne'];

/** Une campagne telle qu'une ligne de la liste la porte. */
export type CampagneLigne = GetCampagnesQuery['campagnes'][number];

/**
 * Un abonné vu par son écran de détail.
 *
 * `NonNullable` parce que le service lève quand la gateway rend `null` : à
 * l'écran, un abonné introuvable est une erreur, pas un abonné vide.
 */
export type AbonneDetail = NonNullable<GetAbonneQuery['abonne']>;

/** Un abonné tel qu'une ligne de la liste le porte. */
export type AbonneLigne = GetAbonnesQuery['abonnes'][number];

/** Un relevé tel que la liste d'une campagne le porte. */
export type ReleveLigne = GetRelevesQuery['releves'][number];

/** Un relevé tel que la vue « par agent » le porte. */
export type ReleveAgent = GetRelevesParAgentQuery['relevesParAgent'][number];

/** Le solde d'une facture, tel que son écran de détail l'interroge. */
export type SoldeDetail = GetSoldeFactureQuery['soldeFacture'];

/** Une ligne du bilan des impayés. */
export type SoldeImpaye = GetImpayesQuery['impayes'][number];

/** Un versement, tel que l'écran d'une facture le liste. */
export type PaiementFacture = GetPaiementsQuery['paiements'][number];

/** Un versement, tel que le journal global le liste. */
export type PaiementJournal = GetAllPaiementsQuery['paiements'][number];

/** Un envoi WhatsApp, tel que l'écran d'une facture le liste. */
export type EnvoiFacture = GetEnvoisQuery['envois'][number];

/** Un envoi WhatsApp, tel que le journal global le liste. */
export type EnvoiJournal = GetAllEnvoisQuery['envois'][number];

/**
 * Ce qu'une feuille d'action sur un abonné a besoin de savoir.
 *
 * Les feuilles `suspendre`, `réactiver`, `résilier`, `arriéré` et
 * `remplacer-compteur` sont ouvertes depuis deux écrans — le détail d'un abonné
 * et sa liste — qui n'interrogent pas la même sélection. Leur entrée ne peut
 * donc être ni `AbonneDetail` ni `AbonneLigne` : ce serait lier un composant
 * partagé à la requête d'un seul de ses appelants.
 *
 * Elle déclare à la place exactement ce que la feuille lit. Un écran est libre
 * de lui passer n'importe quelle vue qui contient au moins ça — et c'est le
 * vérificateur de types qui le dit, non la convention.
 */
export interface AbonneCible {
  id: string;
  nom: string;
  prenom: string;
}

/** Idem, pour les feuilles qui manipulent aussi le compteur posé. */
export interface AbonneCibleCompteur extends AbonneCible {
  numeroAbonne: string;
  compteur: {
    id: string;
    numeroCompteur: number;
    quartier: string;
    camp: number;
    datePose: string;
    position: string;
  } | null;
}

/**
 * Ce qu'un formulaire d'encaissement a besoin de savoir de sa facture.
 *
 * `paiement-form` vit dans `shared/` et sert l'écran d'une facture comme celui
 * d'un abonné ; il ne lit que ces deux champs. Lui donner la vue d'un écran
 * l'aurait rendu inutilisable depuis l'autre.
 */
export interface FactureCible {
  factureId: string;
  abonneId: string;
}

/**
 * Ce que le panneau d'encaissement d'une ligne de liste lit.
 *
 * Il étend `FactureCible` parce qu'il transmet sa facture au formulaire
 * d'encaissement : ce qu'il reçoit doit donc contenir au moins ce que le
 * formulaire exige. L'héritage l'énonce plutôt que de le répéter.
 */
export interface FactureCibleNommee extends FactureCible {
  numeroFacture: string;
  abonneNom: string;
}
