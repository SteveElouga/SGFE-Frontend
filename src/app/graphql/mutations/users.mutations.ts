import { gql } from '@apollo/client/core';

const USER_FIELDS = gql`
  fragment UserFieldsFull on User {
    id
    username
    email
    phoneNumber
    role
    isActive
    createdAt
  }
`;

export const CREATE_USER = gql`
  ${USER_FIELDS}
  mutation CreateUser(
    $username: String!
    $phoneNumber: String!
    $role: Role!
    $email: String
  ) {
    createUser(
      username: $username
      phoneNumber: $phoneNumber
      role: $role
      email: $email
    ) {
      ...UserFieldsFull
    }
  }
`;

export const UPDATE_USER = gql`
  ${USER_FIELDS}
  mutation UpdateUser(
    $id: ID!
    $email: String
    $role: Role
    $phoneNumber: String
  ) {
    updateUser(id: $id, email: $email, role: $role, phoneNumber: $phoneNumber) {
      ...UserFieldsFull
    }
  }
`;

export const DEACTIVATE_USER = gql`
  ${USER_FIELDS}
  mutation DeactivateUser($id: ID!) {
    deactivateUser(id: $id) {
      ...UserFieldsFull
    }
  }
`;

// Symétrique de deactivateUser (is_active = True). Livré côté backend.
export const REACTIVATE_USER = gql`
  ${USER_FIELDS}
  mutation ReactivateUser($id: ID!) {
    reactivateUser(id: $id) {
      ...UserFieldsFull
    }
  }
`;

// Déclenche la réinitialisation de mot de passe / renvoi d'activation (même
// mutation). Le backend choisit le canal selon l'état + le rôle de la cible :
// lien e-mail Brevo pour ADMIN, OTP WhatsApp sinon. Ne renvoie JAMAIS de mot de
// passe. Auth ADMIN requise (sinon PERMISSION_DENIED).
export const RESET_USER_PASSWORD = gql`
  ${USER_FIELDS}
  mutation ResetUserPassword($id: ID!) {
    resetUserPassword(id: $id) {
      ...UserFieldsFull
    }
  }
`;
