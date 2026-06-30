import { gql } from '@apollo/client/core';

const ABONNE_LIST_FIELDS = gql`
  fragment AbonneListFields on Abonne {
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
`;

export const CREATE_ABONNE = gql`
  mutation CreateAbonne($input: CreateAbonneInput!) {
    createAbonne(input: $input) {
      id
      numeroAbonne
      compteur {
        numeroCompteur
      }
    }
  }
`;

export const UPDATE_ABONNE = gql`
  mutation UpdateAbonne($id: ID!, $input: UpdateAbonneInput!) {
    updateAbonne(id: $id, input: $input) {
      id
      nom
      prenom
      telephoneWhatsapp
      adresse
      statut
    }
  }
`;

export const SUSPENDRE_ABONNE = gql`
  ${ABONNE_LIST_FIELDS}
  mutation SuspendreAbonne($id: ID!) {
    suspendreAbonne(id: $id) {
      ...AbonneListFields
    }
  }
`;

export const REACTIVER_ABONNE = gql`
  ${ABONNE_LIST_FIELDS}
  mutation ReactiverAbonne($id: ID!) {
    reactiverAbonne(id: $id) {
      ...AbonneListFields
    }
  }
`;

export const RESILIER_ABONNE = gql`
  mutation ResilierAbonne($id: ID!) {
    resilierAbonne(id: $id) {
      id
      statut
    }
  }
`;

export const UPDATE_COMPTEUR = gql`
  mutation UpdateCompteur($abonneId: ID!, $input: UpdateCompteurInput!) {
    updateCompteur(abonneId: $abonneId, input: $input) {
      id
      numeroCompteur
      quartier
      camp
      indexInitial
      datePose
      statut
    }
  }
`;

export const REMPLACER_COMPTEUR = gql`
  mutation RemplacerCompteur($abonneId: ID!, $input: RemplacerCompteurInput!) {
    remplacerCompteur(abonneId: $abonneId, input: $input) {
      id
      numeroCompteur
      quartier
      camp
      indexInitial
      datePose
      statut
    }
  }
`;
