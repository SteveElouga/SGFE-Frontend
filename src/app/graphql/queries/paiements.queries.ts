import { gql } from '@apollo/client/core';

export const GET_ALL_PAIEMENTS = gql`
  query GetAllPaiements {
    paiements {
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

export const GET_IMPAYES = gql`
  query GetImpayes {
    impayes {
      factureId
      montantTotal
      montantPaye
      soldeRestant
      statut
    }
  }
`;

export const GET_SUIVI_IMPAYE = gql`
  query GetSuiviImpaye($factureId: String!) {
    suiviImpaye(factureId: $factureId) {
      suiviId
      factureId
      abonneId
      dateDepassement
      etapeActuelle
      resoluLe
    }
  }
`;
