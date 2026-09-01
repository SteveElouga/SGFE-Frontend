import { gql } from '@apollo/client/core';

/**
 * Sélections partagées entre plusieurs documents.
 *
 * Un fragment n'est pas ici une économie de frappe : c'est la seule façon de
 * garantir que deux documents rapportent **exactement** la même forme. Dès que
 * deux documents alimentent le même écran, leurs sélections doivent être
 * identiques, sinon l'un des deux appauvrit ce que l'autre avait rempli.
 *
 * Le cas qui a motivé ce fichier : `GET_ABONNES` recopiait la sélection de
 * `AbonneListFields` en clair, et `ABONNE_UPDATED_SUB` en recopiait une
 * troisième version — la même, moins `numeroAbonne`. La souscription écrit dans
 * le cache de la liste (`updateQuery`), donc à la première mise à jour temps
 * réel d'un abonné, le numéro d'abonné disparaissait de sa ligne. Trois copies
 * d'une même sélection, dont une avait déjà dérivé, sans que rien ne le signale.
 *
 * Avec un fragment partagé, les types générés des trois documents sont le même
 * type. La dérive n'est plus possible ; elle devient une erreur de compilation.
 */

/** Un abonné tel que la liste, ses mutations et sa souscription le portent. */
export const ABONNE_LIST_FIELDS = gql`
  fragment AbonneListFields on Abonne {
    id
    numeroAbonne
    nom
    prenom
    statut
    compteur {
      id
      numeroCompteur
      quartier
      camp
      statut
    }
  }
`;

/**
 * Un abonné tel que son écran de détail le porte.
 *
 * `GET_ABONNE` et `ABONNE_DETAIL_UPDATED_SUB` alimentent le même signal — la
 * souscription remplace l'objet chargé par la requête. Deux sélections
 * différentes y produiraient un écran qui se vide en partie tout seul.
 */
export const ABONNE_DETAIL_FIELDS = gql`
  fragment AbonneDetailFields on Abonne {
    id
    numeroAbonne
    nom
    prenom
    telephoneWhatsapp
    adresse
    statut
    createdAt
    compteur {
      id
      numeroCompteur
      quartier
      camp
      indexInitial
      datePose
      statut
    }
  }
`;

/**
 * Une facture telle que les listes la portent.
 *
 * `GET_FACTURES` et `GET_FACTURES_PAR_CAMPAGNE` alimentent le **même** signal
 * dans `factures-list` — la seconde quand on ouvre les factures d'une campagne,
 * la première sinon. Leurs sélections avaient divergé : la vue par campagne ne
 * demandait ni `dateReleve`, ni `campagneId`, ni la période. Les colonnes
 * correspondantes étaient donc vides dans cette vue-là, et seulement dans
 * celle-là.
 *
 * `FACTURE_UPDATED_SUB` reste volontairement plus étroite : elle ne décrit pas
 * une ligne mais un **correctif** appliqué par diffusion (`{ ...f, ...maj }`),
 * et les champs joints par la gateway (`abonneNom`, `campagneNom`) ne sont pas
 * garantis peuplés sur la charge publiée. Les demander écraserait de bonnes
 * valeurs par des chaînes vides.
 */
export const FACTURE_LIGNE_FIELDS = gql`
  fragment FactureLigneFields on Facture {
    factureId
    numeroFacture
    abonneId
    abonneNom
    abonneNumero
    campagneId
    campagneNom
    campagnePeriodeMois
    campagnePeriodeAnnee
    statut
    consommation
    montant
    dateReleve
    dateLimitePaiement
  }
`;

/**
 * Une campagne telle que sa liste, son détail et ses factures la portent.
 *
 * Trois champs y entrent qu'aucun document ne demandait :
 * `genererFacturesAuto`, `envoyerWhatsappAuto` et `numeroMobileMoney`.
 *
 * Deux écrans les lisaient pourtant. `factures-list` teste
 * `campagne()?.genererFacturesAuto === false` pour expliquer une liste vide —
 * `undefined === false` est faux, la bannière n'est jamais apparue. Le même
 * écran lit `campagne()?.envoyerWhatsappAuto ?? false` avant de générer les
 * factures : l'envoi automatique était donc toujours désactivé, quelle qu'ait
 * été la case cochée à la création de la campagne. Et `campagne-detail` affiche
 * le même réglage dans son résumé de clôture, où il annonçait « inactif » en
 * toutes circonstances.
 *
 * `numeroMobileMoney` entre pour la même raison : le formulaire le saisit, la
 * campagne le stocke, aucune lecture ne le rapportait.
 */
export const CAMPAGNE_FIELDS = gql`
  fragment CampagneFields on Campagne {
    campagneId
    nom
    periodeMois
    periodeAnnee
    statut
    datePlanifiee
    dateCreation
    dateCloture
    createdBy
    numeroMobileMoney
    genererFacturesAuto
    envoyerWhatsappAuto
  }
`;

/**
 * Un versement, tel que les écrans le listent.
 *
 * `GET_ALL_PAIEMENTS` demandait les quatre champs d'annulation,
 * `GET_PAIEMENTS` non — et c'est `GET_PAIEMENTS` qui alimente le journal des
 * versements de l'écran d'une facture, dont le gabarit teste `p.annule` pour
 * barrer la ligne et afficher le motif. Un versement annulé s'y affichait donc
 * comme un versement ordinaire, sur l'écran même où l'on vient vérifier ce qui
 * a été encaissé.
 *
 * Le journal global, lui, les demandait : la même information était juste dans
 * une liste et fausse dans l'autre.
 */
export const PAIEMENT_FIELDS = gql`
  fragment PaiementFields on Paiement {
    paiementId
    factureId
    montant
    datePaiement
    modePaiement
    referenceTransaction
    createdAt
    annule
    annuleLe
    annulePar
    motifAnnulation
  }
`;
