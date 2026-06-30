import { gql } from '@apollo/client/core';

export const GET_CAMPAGNES = gql`
  query GetCampagnes {
    campagnes {
      campagneId
      nom
      periodeMois
      periodeAnnee
      statut
      datePlanifiee
      dateCreation
      dateCloture
    }
  }
`;

export const GET_CAMPAGNE = gql`
  query GetCampagne($campagneId: String!) {
    campagne(campagneId: $campagneId) {
      campagneId
      nom
      periodeMois
      periodeAnnee
      statut
      datePlanifiee
      dateCreation
      dateCloture
    }
  }
`;

export const GET_RELEVES = gql`
  query GetReleves($campagneId: String!) {
    releves(campagneId: $campagneId) {
      releveId
      abonneId
      abonne {
        nom
        prenom
        quartier
        camp
      }
      ancienIndex
      nouveauIndex
      consommation
      statut
      observation
      dateReleve
    }
  }
`;

export const GET_PROGRESSION = gql`
  query GetProgression($campagneId: String!) {
    progression(campagneId: $campagneId) {
      campagneId
      totalAbonnes
      nbReleves
      nbEnAttente
      pourcentage
    }
  }
`;

export const GET_DERNIER_INDEX = gql`
  query GetDernierIndex($abonneId: String!) {
    dernierIndex(abonneId: $abonneId) {
      abonneId
      dernierIndex
      estIndexInitial
    }
  }
`;

// Sidebar: campagneActive n'existe pas dans l'API — on récupère toutes les
// campagnes et on filtre EN_COURS côté client.
export const GET_CAMPAGNE_ACTIVE = gql`
  query GetCampagneActive {
    campagnes {
      campagneId
      periodeMois
      periodeAnnee
      statut
    }
  }
`;
