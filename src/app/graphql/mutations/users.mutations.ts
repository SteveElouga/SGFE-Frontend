import { gql } from '@apollo/client';

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

// PENDING BACKEND: symétrique de deactivateUser (is_active = True).
// Backend s'est engagé à l'ajouter (cf. docs/BESOINS_API_utilisateurs.md).
export const REACTIVATE_USER = gql`
  ${USER_FIELDS}
  mutation ReactivateUser($id: ID!) {
    reactivateUser(id: $id) {
      ...UserFieldsFull
    }
  }
`;

// PENDING BACKEND: re-déclenche le flux d'activation selon le rôle
// (lien e-mail Brevo pour ADMIN, OTP WhatsApp sinon). Sert à la fois au
// « Réinitialiser le mot de passe » et au « Renvoyer le lien d'activation ».
export const RESEND_USER_ACTIVATION = gql`
  ${USER_FIELDS}
  mutation ResendUserActivation($id: ID!) {
    resendUserActivation(id: $id) {
      ...UserFieldsFull
    }
  }
`;
