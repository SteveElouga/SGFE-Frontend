import { gql } from '@apollo/client/core';
import { ABONNE_LIST_FIELDS } from '../fragments';

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
      position
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
      position
      statut
      latitude
      longitude
      dateMajPosition
    }
  }
`;

/**
 * Import en masse des coordonnées de compteurs (écran Carte, ADMIN) — PR
 * backend #243. `numeroCompteur` porte `String!` côté entrée uniquement
 * (contrairement à `Compteur.numeroCompteur`, un `Int!`) : la gateway le
 * reparse elle-même, pour dégrader gracieusement ligne par ligne plutôt que de
 * rejeter tout l'envoi sur une seule valeur non convertible.
 */
export const IMPORTER_COORDONNEES_COMPTEURS = gql`
  mutation ImporterCoordonneesCompteurs($coordonnees: [CoordonneeCompteurInput!]!) {
    importerCoordonneesCompteurs(coordonnees: $coordonnees) {
      nbImportees
      erreurs {
        numeroCompteur
        message
      }
    }
  }
`;
