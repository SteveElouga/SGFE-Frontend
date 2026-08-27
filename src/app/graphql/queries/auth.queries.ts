import { gql } from '@apollo/client/core';

export const ME = gql`
  query Me {
    me {
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
