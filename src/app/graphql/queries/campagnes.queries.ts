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
      ancienIndex
      nouveauIndex
      consommation
      statut
      observation
      dateReleve
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

// PENDING DEPLOY (PR #68) — relevés d'UN agent, pour l'écran « Voir la tournée ».
// ADMIN toutes / SUPERVISEUR ses campagnes / AGENT sa propre tournée.
// NE PAS brancher tant que relevesParAgent n'apparaît pas à l'introspection.
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

// ── Agents affectés — PENDING BACKEND ───────────────────────────────────────
// TROU CONFIRMÉ (introspection live 2026-07-04) : le type `Campagne` n'expose
// AUCUN champ `agents`, et il n'existe aucune query pour lire les affectations.
// `affecterAgent` est donc écriture-seule → le détail campagne ne peut pas
// afficher les agents, et le bottom sheet MC-03 ne peut ni pré-cocher ni
// verrouiller les agents déjà affectés. Voir docs/BESOINS_API_campagne_agents.md.
//
// PRIORITÉ 1 (lecture, indispensable) : exposer `agents { id username }` sur le
// type `Campagne`. Il suffira alors d'ajouter le champ à GET_CAMPAGNE — le
// frontend est prêt (agentsLabel + assignedUsernames du sheet). À défaut d'un
// champ sur le type, cette query dédiée fait aussi l'affaire :
export const GET_CAMPAGNE_AGENTS = gql`
  query GetCampagneAgents($campagneId: String!) {
    campagneAgents(campagneId: $campagneId) {
      id
      username
    }
  }
`;

// PRIORITÉ 2 (temps réel, confort) : souscription poussant la liste d'agents à
// jour quand un agent est affecté/retiré (deux ADMIN/SUPERVISEUR en parallèle,
// ou rafraîchissement après affecterAgent). À brancher via subscribeToMore sur
// le détail campagne une fois la lecture (P1) livrée. Aligné sur le pattern
// factureUpdated / progressionUpdated (arg optionnel = flux filtré par campagne).
export const CAMPAGNE_AGENTS_UPDATED_SUB = gql`
  subscription CampagneAgentsUpdated($campagneId: ID!) {
    campagneAgentsUpdated(campagneId: $campagneId) {
      campagneId
      agents {
        id
        username
      }
    }
  }
`;
