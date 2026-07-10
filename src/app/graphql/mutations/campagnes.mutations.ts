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

// Rattache des abonnés SÉLECTIONNÉS à une campagne → crée leurs relevés
// A_RELEVER (sans ça : « 0 abonné à relever »). Idempotent : les doublons ou
// abonnés non ACTIF remontent dans `nbIgnores`. ADMIN / SUPERVISEUR (les siennes).
export const AJOUTER_ABONNES_CAMPAGNE = gql`
  mutation AjouterAbonnesCampagne($campagneId: String!, $abonneIds: [String!]!) {
    ajouterAbonnesCampagne(campagneId: $campagneId, abonneIds: $abonneIds) {
      nbAjoutes
      nbIgnores
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

// Affectation d'un ensemble exact de zones (quartier + camp) à un agent.
export const AFFECTER_ZONES = gql`
  mutation AffecterZones($campagneId: String!, $agentId: String!, $zones: [ZoneInput!]!) {
    affecterZones(campagneId: $campagneId, agentId: $agentId, zones: $zones) {
      agentId
      username
      role
      statut
      derniereActivite
      nbReleves
      zones {
        quartier
        camp
        nbAbonnes
        nbReleves
        pct
      }
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

// Démarrage à la demande d'une campagne PLANIFIEE → EN_COURS (débloque la saisie
// des relevés sans attendre le cron 7h / la date planifiée).
export const DEMARRER_CAMPAGNE = gql`
  mutation DemarrerCampagne($campagneId: String!) {
    demarrerCampagne(campagneId: $campagneId) {
      campagneId
      statut
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

// PENDING DEPLOY (PR #68 feat/campagne-audit-correction-releve) — corrige un
// index déjà RELEVE (ADMIN toutes / SUPERVISEUR ses campagnes). Ajoute une
// entrée CORRECTION à l'audit. NE PAS brancher tant que l'introspection ne
// montre pas corrigerReleve + les champs audit sur le Gateway (sinon la query
// casse). Voir docs/BESOINS_API_tournee_agent.md.
export const CORRIGER_RELEVE = gql`
  mutation CorrigerReleve($input: CorrigerReleveInput!) {
    corrigerReleve(input: $input) {
      releveId
      nouveauIndex
      consommation
      statut
      audit {
        action
        auteur {
          username
          role
        }
        nouvelIndex
        horodatage
      }
    }
  }
`;
