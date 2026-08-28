import { gql } from '@apollo/client/core';

// PENDING BACKEND: confirm query name and arguments (pagination, filters)
export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      username
      email
      phoneNumber
      role
      isActive
      createdAt
    }
  }
`;

// ── Souscription temps réel ───────────────────────────────────────────────────
// Branchée sans argument sur `/utilisateurs` : deux admins y travaillent
// couramment en parallèle. Le second usage prévu — arg = utilisateur connecté,
// pour réagir à sa propre désactivation — n'est PAS branché : fermer une session
// depuis un flux temps réel demande une politique (que faire d'un formulaire en
// cours ?) qui n'a pas été décidée. La révocation par mot de passe le couvre
// déjà au prochain appel.
export const UTILISATEUR_UPDATED_SUB = gql`
  subscription UtilisateurUpdated($utilisateurId: ID) {
    utilisateurUpdated(utilisateurId: $utilisateurId) {
      id
      username
      email
      phoneNumber
      role
      isActive
      createdAt
    }
  }
`;
