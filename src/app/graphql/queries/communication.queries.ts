import { gql } from '@apollo/client/core';
import { DIFFUSION_FIELDS } from '../fragments';

export const GET_DIFFUSIONS = gql`
  ${DIFFUSION_FIELDS}
  query GetDiffusions {
    diffusions {
      ...DiffusionFields
    }
  }
`;

export const GET_DIFFUSION = gql`
  ${DIFFUSION_FIELDS}
  query GetDiffusion($diffusionId: String!) {
    diffusion(diffusionId: $diffusionId) {
      ...DiffusionFields
    }
  }
`;

export const DIFFUSION_PROGRESSION_UPDATED_SUB = gql`
  ${DIFFUSION_FIELDS}
  subscription DiffusionProgressionUpdated($diffusionId: ID) {
    diffusionProgressionUpdated(diffusionId: $diffusionId) {
      ...DiffusionFields
    }
  }
`;
