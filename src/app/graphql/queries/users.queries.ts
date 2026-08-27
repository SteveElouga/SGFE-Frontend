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

// ── Souscription temps réel — PENDING BACKEND (message « souscriptions ») ─────
// Deux usages prévus à la livraison : sans arg → liste utilisateurs (création /
// désactivation par un autre admin) ; avec arg = utilisateur connecté → réagir à
// sa propre désactivation / changement de rôle (sécurité : logout / permissions).
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
