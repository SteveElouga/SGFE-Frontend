import { gql } from '@apollo/client/core';

export const UPDATE_INFOS_SOCIETE = gql`
  mutation UpdateInfosSociete($input: UpdateInfosSocieteInput!) {
    updateInfosSociete(input: $input) {
      nom
      adresse
      telephone
      logoPath
      updatedAt
    }
  }
`;

export const UPDATE_CONFIG = gql`
  mutation UpdateConfig($cle: String!, $valeur: String!) {
    updateConfig(cle: $cle, valeur: $valeur) {
      cle
      valeur
      description
    }
  }
`;
