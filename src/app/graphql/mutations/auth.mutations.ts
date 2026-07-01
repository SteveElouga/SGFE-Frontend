import { gql } from '@apollo/client';

const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    username
    email
    phoneNumber
    role
    isActive
    createdAt
  }
`;

export const LOGIN = gql`
  ${USER_FIELDS}
  mutation Login($identifier: String!, $password: String!) {
    login(identifier: $identifier, password: $password) {
      accessToken
      expiresIn
      user {
        ...UserFields
      }
    }
  }
`;

export const REFRESH_TOKEN = gql`
  ${USER_FIELDS}
  mutation RefreshToken {
    refreshToken {
      accessToken
      expiresIn
      user {
        ...UserFields
      }
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout {
    logout
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

export const ACTIVATE_ACCOUNT = gql`
  mutation ActivateAccount($token: String!, $password: String!) {
    activateAccount(token: $token, password: $password)
  }
`;

export const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

export const REQUEST_PHONE_OTP = gql`
  mutation RequestPhoneOtp($phoneNumber: String!) {
    requestPhoneOtp(phoneNumber: $phoneNumber) {
      maskedPhone
    }
  }
`;

export const VERIFY_OTP_AND_SET_PASSWORD = gql`
  mutation VerifyOtpAndSetPassword(
    $phoneNumber: String!
    $otpCode: String!
    $password: String!
  ) {
    verifyOtpAndSetPassword(
      phoneNumber: $phoneNumber
      otpCode: $otpCode
      password: $password
    )
  }
`;

export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const UPDATE_EMAIL = gql`
  mutation UpdateEmail($email: String!) {
    updateEmail(email: $email) {
      id
      email
    }
  }
`;
