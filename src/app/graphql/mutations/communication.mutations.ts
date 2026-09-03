import { gql } from '@apollo/client/core';
import { DIFFUSION_FIELDS } from '../fragments';

export const CREER_DIFFUSION = gql`
  ${DIFFUSION_FIELDS}
  mutation CreerDiffusion($message: String!, $abonneIds: [String!]!) {
    creerDiffusion(message: $message, abonneIds: $abonneIds) {
      ...DiffusionFields
    }
  }
`;
