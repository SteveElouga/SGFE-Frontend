import { gql } from '@apollo/client/core';

export const ABONNE_UPDATED_SUB = gql`
  subscription AbonneUpdated {
    abonneUpdated {
      id
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

export const ABONNE_DETAIL_UPDATED_SUB = gql`
  subscription AbonneDetailUpdated($id: ID!) {
    abonneUpdated(abonneId: $id) {
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
      ancienCompteur { numeroCompteur quartier camp indexInitial }
      nouveauCompteur { numeroCompteur quartier camp indexInitial }
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
