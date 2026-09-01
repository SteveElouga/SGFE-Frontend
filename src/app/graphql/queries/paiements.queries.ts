import { gql } from '@apollo/client/core';
import { PAIEMENT_FIELDS } from '../fragments';

export const GET_ALL_PAIEMENTS = gql`
  ${PAIEMENT_FIELDS}
  query GetAllPaiements {
    paiements {
      ...PaiementFields
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
      abonneId
      dateLimitePaiement
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

/**
 * Ce qu'un abonné doit encore, toutes factures confondues.
 *
 * `horsFactureId` sert à l'affichage sur une facture : le « solde antérieur »
 * est ce que l'abonné doit EN PLUS de celle qu'il consulte.
 *
 * `plusAncienneEcheance` porte l'âge de la dette — c'est lui qui fait payer,
 * pas le montant.
 */
export const GET_DETTE_ABONNE = gql`
  query GetDetteAbonne($abonneId: String!, $horsFactureId: String) {
    detteAbonne(abonneId: $abonneId, horsFactureId: $horsFactureId) {
      totalDu
      nbFactures
      plusAncienneEcheance
    }
  }
`;
