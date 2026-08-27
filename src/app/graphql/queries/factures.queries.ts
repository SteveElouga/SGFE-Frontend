import { gql } from '@apollo/client/core';

export const GET_FACTURES_PAR_CAMPAGNE = gql`
  query GetFacturesParCampagne($campagneId: String!) {
    facturesParCampagne(campagneId: $campagneId) {
      factureId
      numeroFacture
      abonneId
      abonneNom
      abonneNumero
      campagneNom
      statut
      consommation
      montant
      dateLimitePaiement
    }
  }
`;

export const GET_FACTURES = gql`
  query GetFactures($campagneId: String, $abonneId: String, $statut: String) {
    factures(campagneId: $campagneId, abonneId: $abonneId, statut: $statut) {
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
    }
  }
`;

export const GET_PAIEMENTS = gql`
  query GetPaiements($factureId: String!, $abonneId: String) {
    paiements(factureId: $factureId, abonneId: $abonneId) {
      paiementId
      factureId
      montant
      datePaiement
      modePaiement
      referenceTransaction
      createdAt
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

// ── Souscriptions temps réel — PENDING BACKEND ──────────────────────────────
// Contrats convenus avec l'équipe backend (message « souscriptions temps réel »).
// Non branchés tant que le backend ne les expose pas : à la livraison, brancher
// via subscribeToMore + passer les listes en cache-first (cf. flag realtimeReady).
// Sélections alignées sur GET_FACTURES / GET_PAIEMENTS. Arg optionnel = convention
// abonneUpdated (sans arg = flux global, avec arg = filtré sur une campagne).
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
