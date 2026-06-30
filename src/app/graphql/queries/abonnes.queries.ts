import { gql } from '@apollo/client/core';

export const GET_ABONNES = gql`
  query GetAbonnes($statut: StatutAbonne) {
    abonnes(statut: $statut) {
      id
      numeroAbonne
      nom
      prenom
      statut
      compteur {
        id
        numeroCompteur
        quartier
        camp
        statut
      }
    }
  }
`;

export const GET_ABONNE = gql`
  query GetAbonne($id: ID!) {
    abonne(id: $id) {
      id
      numeroAbonne
      nom
      prenom
      telephoneWhatsapp
      adresse
      statut
      createdAt
      compteur {
        id
        numeroCompteur
        quartier
        camp
        indexInitial
        datePose
        statut
      }
    }
  }
`;
