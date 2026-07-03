import { gql } from '@apollo/client/core';

export const GET_FACTURES_PAR_CAMPAGNE = gql`
  query GetFacturesParCampagne($campagneId: String!) {
    facturesParCampagne(campagneId: $campagneId) {
      factureId
      numeroFacture
      abonneId
      statut
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
      campagneId
      statut
      montant
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
      campagneId
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
