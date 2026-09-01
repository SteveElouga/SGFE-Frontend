import { gql } from '@apollo/client/core';
import { FACTURE_LIGNE_FIELDS, PAIEMENT_FIELDS } from '../fragments';

export const GET_FACTURES_PAR_CAMPAGNE = gql`
  ${FACTURE_LIGNE_FIELDS}
  query GetFacturesParCampagne($campagneId: String!) {
    facturesParCampagne(campagneId: $campagneId) {
      ...FactureLigneFields
    }
  }
`;

export const GET_FACTURES = gql`
  ${FACTURE_LIGNE_FIELDS}
  query GetFactures($campagneId: String, $abonneId: String, $statut: String) {
    factures(campagneId: $campagneId, abonneId: $abonneId, statut: $statut) {
      ...FactureLigneFields
    }
  }
`;

export const GET_FACTURE = gql`
  query GetFacture($factureId: String!) {
    facture(factureId: $factureId) {
      factureId
      numeroFacture
      abonneId
      abonneNom
      abonneNumero
      campagneId
      campagneNom
      ancienIndex
      nouveauIndex
      consommation
      prixM3
      montant
      statut
      dateReleve
      dateLimitePaiement
      dateGeneration
      pdfPath
      numeroMobileMoney
      campagnePeriodeMois
      campagnePeriodeAnnee
      # Annulation : le bandeau de l'écran de détail testait ces quatre champs
      # sans qu'aucun ne soit demandé. Il n'a jamais pu s'afficher.
      motifAnnulation
      dateAnnulation
      annuleePar
      remplaceeParId
      remplaceId
      # nature décide si l'annulation propose une régénération : une
      # régularisation n'a pas de relevé, donc rien à régénérer. Non demandé,
      # le test f.nature !== 'REGULARISATION' était toujours vrai.
      nature
      motif
    }
  }
`;

export const GET_TARIF_ACTUEL = gql`
  query GetTarifActuel {
    tarifActuel {
      tarifId
      prixM3
      dateEffet
      isActive
    }
  }
`;

export const GET_SOLDE_FACTURE = gql`
  query GetSoldeFacture($factureId: String!) {
    soldeFacture(factureId: $factureId) {
      factureId
      montantTotal
      montantPaye
      soldeRestant
      statut
      abonneId
      dateLimitePaiement
      avoirImpute
    }
  }
`;

export const GET_PAIEMENTS = gql`
  ${PAIEMENT_FIELDS}
  query GetPaiements($factureId: String!, $abonneId: String) {
    paiements(factureId: $factureId, abonneId: $abonneId) {
      ...PaiementFields
    }
  }
`;

export const GET_ENVOIS = gql`
  query GetEnvois($factureId: String!, $abonneId: String) {
    envois(factureId: $factureId, abonneId: $abonneId) {
      envoiId
      statut
      dateEnvoi
      typeEnvoi
      erreur
    }
  }
`;

// Historique GLOBAL des envois WhatsApp (écran Envois) : `envois` sans filtre
// renvoie tous les envois (ADMIN, COMPTABLE).
export const GET_ALL_ENVOIS = gql`
  query GetAllEnvois {
    envois {
      envoiId
      abonneId
      factureId
      typeEnvoi
      statut
      dateEnvoi
      erreur
      raisonEchec
    }
  }
`;

// ── Souscriptions temps réel ──────────────────────────────────────────────────
// Branchées sans argument sur /factures et /paiements : l'argument `campagneId`
// filtrerait à la source, mais il faudrait rouvrir le flux à chaque changement
// de campagne du sélecteur, et un abonnement resté ouvert sur l'ancienne serait
// pire que pas d'abonnement. Les écrans ne fusionnent que ce qu'ils affichent.
//
// Attention : ces sélections sont des SOUS-ENSEMBLES de GET_FACTURES /
// GET_PAIEMENTS, pas leur copie. `FactureUpdated` ne porte ni les index, ni le
// prix au m³, ni les libellés enrichis ; `PaiementCree` ne porte aucun champ
// d'annulation. Les écrans fusionnent sur la ligne existante ou comblent les
// manques — remplacer une ligne par ce que porte le flux la mutilerait.
//
// Trous de publication côté serveur, à connaître avant de s'y fier :
//   facture:events  — publié sur GenererFactures et UpdateStatutFacture,
//                     PAS sur l'annulation, la régénération, la régularisation.
//   paiement:events — publié sur EnregistrerPaiement seulement, ni sur
//                     l'annulation ni sur EnregistrerPaiementAbonne.
export const FACTURE_UPDATED_SUB = gql`
  subscription FactureUpdated($campagneId: ID) {
    factureUpdated(campagneId: $campagneId) {
      factureId
      numeroFacture
      abonneId
      campagneId
      statut
      consommation
      montant
      dateReleve
      dateLimitePaiement
    }
  }
`;

export const PAIEMENT_CREE_SUB = gql`
  subscription PaiementCree($campagneId: ID) {
    paiementCree(campagneId: $campagneId) {
      paiementId
      factureId
      montant
      datePaiement
      modePaiement
      referenceTransaction
    }
  }
`;
// PENDING BACKEND: le type Envoi n'expose pas 'typeEnvoi' (contrairement à
// ARCHITECTURE.md, obsolète). Le code couleur du journal (RAPPEL/AVERT) est donc
// inactif — envoiClass() dégrade en '' tant que le backend n'ajoute pas ce champ.

/**
 * Avoir (crédit) d'un abonné et son journal.
 *
 * Le mécanisme existait de bout en bout côté serveur — trop-perçu porté au
 * crédit, imputé de lui-même sur la facture suivante — mais aucun écran ne
 * l'affichait. Un abonné pouvait avoir 5 000 FCFA d'avoir sans que le caissier
 * ni lui ne le sachent, et découvrir à la facture suivante un montant réduit
 * qu'aucun écran n'expliquait.
 */
export const GET_AVOIR_ABONNE = gql`
  query GetAvoirAbonne($abonneId: String!) {
    avoirAbonne(abonneId: $abonneId) {
      abonneId
      montant
      mouvements {
        montant
        typeMouvement
        motif
        factureId
        creePar
        createdAt
      }
    }
  }
`;
