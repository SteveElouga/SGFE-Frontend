import { gql } from '@apollo/client/core';

// Statistiques globales pour l'écran Rapports (MB-08 / 13).
export const GET_STATS_GLOBALES = gql`
  query GetStatsGlobales {
    statsGlobales {
      consommationTotaleGlobale
      montantTotalFactureGlobal
      montantTotalEncaisseGlobal
      historiqueCampagnes {
        campagneId
        nomCampagne
        totalAbonnes
        nbReleves
        pourcentageProgression
        consommationTotale
      }
    }
  }
`;
