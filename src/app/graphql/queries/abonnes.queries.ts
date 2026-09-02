import { gql } from '@apollo/client/core';
import { ABONNE_DETAIL_FIELDS, ABONNE_LIST_FIELDS } from '../fragments';

export const ABONNE_UPDATED_SUB = gql`
  ${ABONNE_LIST_FIELDS}
  subscription AbonneUpdated {
    abonneUpdated {
      ...AbonneListFields
    }
  }
`;

export const ABONNE_DETAIL_UPDATED_SUB = gql`
  ${ABONNE_DETAIL_FIELDS}
  subscription AbonneDetailUpdated($id: ID!) {
    abonneUpdated(abonneId: $id) {
      ...AbonneDetailFields
    }
  }
`;

export const GET_ABONNES = gql`
  ${ABONNE_LIST_FIELDS}
  query GetAbonnes($statut: StatutAbonne) {
    abonnes(statut: $statut) {
      ...AbonneListFields
    }
  }
`;

export const GET_ABONNES_ACTIFS = gql`
  query GetAbonnesActifs {
    abonnesActifs {
      id
      compteur {
        quartier
        camp
      }
    }
  }
`;

export const GET_HISTORIQUE_COMPTEUR = gql`
  query GetHistoriqueCompteur($id: ID!) {
    historiqueCompteur(id: $id) {
      id
      indexFermeture
      dateRemplacement
      createdAt
      ancienCompteur { numeroCompteur quartier camp indexInitial position }
      nouveauCompteur { numeroCompteur quartier camp indexInitial position }
    }
  }
`;

export const GET_ABONNE = gql`
  ${ABONNE_DETAIL_FIELDS}
  query GetAbonne($id: ID!) {
    abonne(id: $id) {
      ...AbonneDetailFields
    }
  }
`;
