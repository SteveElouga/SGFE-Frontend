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
      createdBy
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
      createdBy
    }
  }
`;

export const GET_RELEVES = gql`
  query GetReleves($campagneId: String!) {
    releves(campagneId: $campagneId) {
      releveId
      abonneId
      ancienIndex
      nouveauIndex
      consommation
      statut
      observation
      dateReleve
      abonneNom
      abonnePrenom
      numeroAbonne
      numeroCompteur
      quartier
      camp
    }
  }
`;

// Agents affectés à une campagne (statut de tournée, zones, relevés) — LIVRÉ.
export const GET_AGENTS_CAMPAGNE = gql`
  query GetAgentsCampagne($campagneId: String!) {
    agentsCampagne(campagneId: $campagneId) {
      agentId
      username
      role
      statut
      derniereActivite
      nbReleves
      zones {
        quartier
        camp
      }
    }
  }
`;

// Répartition par zone d'une campagne (zone → agent → abonnés/relevés/%) — LIVRÉ.
export const GET_REPARTITION_ZONE = gql`
  query GetRepartitionZone($campagneId: String!) {
    repartitionParZone(campagneId: $campagneId) {
      quartier
      camp
      agentId
      agentUsername
      nbAbonnes
      nbReleves
      pct
    }
  }
`;

// Relevés d'UN agent — LIVRÉ. ADMIN toutes / SUPERVISEUR ses campagnes /
// AGENT sa propre tournée (agentId doit être le sien, sinon PERMISSION_DENIED).
// Source de données de l'écran terrain agent (cf. terrain.component load()).
export const GET_RELEVES_PAR_AGENT = gql`
  query GetRelevesParAgent($campagneId: String!, $agentId: String!) {
    relevesParAgent(campagneId: $campagneId, agentId: $agentId) {
      releveId
      abonneId
      ancienIndex
      nouveauIndex
      consommation
      statut
      observation
      dateReleve
      abonneNom
      abonnePrenom
      numeroAbonne
      numeroCompteur
      quartier
      camp
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

// Ventilation autoritative pour la modale de clôture (ADMIN + SUPERVISEUR).
export const GET_RESUME_CLOTURE = gql`
  query ResumeCloture($campagneId: String!) {
    resumeCloture(campagneId: $campagneId) {
      campagneId
      totalAbonnes
      nbReleves
      nbEstimes
      nbNonReleves
      nbRestants
      nbFacturesAGenerer
    }
  }
`;

// ── Souscription temps réel — PENDING BACKEND (message « souscriptions ») ─────
// Avancement de campagne en direct (chaque saisie d'index d'un agent).
// À brancher à la livraison (subscribeToMore sur la liste / le détail campagne).
export const PROGRESSION_UPDATED_SUB = gql`
  subscription ProgressionUpdated($campagneId: ID) {
    progressionUpdated(campagneId: $campagneId) {
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

// Agents AGENT actifs affectables (ADMIN + SUPERVISEUR) — remplace l'usage de
// `users` (réservé ADMIN) pour peupler le sélecteur d'affectation.
export const GET_AGENTS_DISPONIBLES = gql`
  query GetAgentsDisponibles {
    agentsDisponibles {
      id
      username
      phoneNumber
      role
      isActive
    }
  }
`;

// Zones (quartier + camp) et nombre d'abonnés actifs par zone.
export const GET_ZONES_DISPONIBLES = gql`
  query GetZonesDisponibles {
    zonesDisponibles {
      quartier
      camp
      nbAbonnes
    }
  }
`;
