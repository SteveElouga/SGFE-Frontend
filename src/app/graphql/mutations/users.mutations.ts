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
