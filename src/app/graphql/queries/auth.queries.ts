import { gql } from '@apollo/client';

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
