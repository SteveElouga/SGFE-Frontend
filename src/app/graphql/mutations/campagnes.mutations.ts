import { gql } from '@apollo/client/core';

export const CREER_CAMPAGNE = gql`
  mutation CreerCampagne($input: CreateCampagneInput!) {
    creerCampagne(input: $input) {
      campagneId
      nom
      statut
      periodeMois
      periodeAnnee
      datePlanifiee
      dateCreation
      dateCloture
    }
  }
`;

export const AFFECTER_AGENT = gql`
  mutation AffecterAgent($campagneId: String!, $agentId: String!) {
    affecterAgent(campagneId: $campagneId, agentId: $agentId) {
      campagneId
      nom
      statut
    }
  }
`;

export const CLOTURER_CAMPAGNE = gql`
  mutation CloturerCampagne($campagneId: String!) {
    cloturerCampagne(campagneId: $campagneId) {
      campagneId
      statut
      dateCloture
    }
  }
`;

export const SAISIR_INDEX = gql`
  mutation SaisirIndex($input: SaisirIndexInput!) {
    saisirIndex(input: $input) {
      releveId
      abonneId
      nouveauIndex
      consommation
      statut
      dateReleve
    }
  }
`;

export const MARQUER_NON_RELEVE = gql`
  mutation MarquerNonReleve($input: MarquerNonReleveInput!) {
    marquerNonReleve(input: $input) {
      releveId
      abonneId
      statut
      observation
    }
  }
`;
