import { gql } from '@apollo/client';

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
