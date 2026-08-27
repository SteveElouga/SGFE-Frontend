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

/**
 * Agrégat mensuel réel — remplace la dérivation approximative frontend qui
 * répartissait proportionnellement l'encaissé global selon la conso.
 *
 * Sémantique backend :
 * - `encaisse` = paiements dont datePaiement tombe dans le mois (paiements
 *   annulés exclus). Un paiement de juillet sur une facture de mai compte
 *   en juillet.
 * - `facture` / `consommation` = factures dont dateGeneration tombe dans le
 *   mois. `consommation` = SUM `Facture.consommation` par mois de génération
 *   (pas par période de relevé).
 * - Fenêtre glissante zéro-remplie : un mois sans donnée renvoie 0 (pas
 *   d'absence), les deltas restent calculables honnêtement.
 * - Retour trié descendant : `[0]` = mois courant serveur.
 *
 * Autorisation : ADMIN + COMPTABLE global. SUPERVISEUR filtré au resolver
 * sur les campagnes qu'il a créées (`Campagne.createdBy`).
 */
export const GET_STATS_PAR_MOIS = gql`
  query GetStatsParMois($nbMois: Int) {
    statsParMois(nbMois: $nbMois) {
      mois
      annee
      moisNum
      encaisse
      facture
      consommation
      nbPaiements
      nbFactures
    }
  }
`;
