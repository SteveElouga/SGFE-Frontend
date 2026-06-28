import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      accessToken
      expiresIn
      user {
        id
        username
        email
        role
        isActive
        createdAt
      }
    }
  }
`;

export const REFRESH_TOKEN = gql`
  mutation RefreshToken {
    refreshToken {
      accessToken
      expiresIn
      user {
        id
        username
        email
        role
        isActive
        createdAt
      }
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout {
    logout
  }
`;
