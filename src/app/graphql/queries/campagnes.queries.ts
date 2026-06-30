import { gql } from '@apollo/client/core';

// Returns the single campaign currently EN_COURS, or null if none.
export const GET_CAMPAGNE_ACTIVE = gql`
  query GetCampagneActive {
    campagneActive {
      id
      periodeMois
      periodeAnnee
      totalAbonnes
      nbReleves
      pourcentage
    }
  }
`;
