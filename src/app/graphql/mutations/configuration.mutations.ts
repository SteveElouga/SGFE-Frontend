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

// Envoi de test WhatsApp (ADMIN). Renvoie success + message : sur échec de
// livraison le servicer capture l'erreur et renvoie success=false + le motif
// exact (« WhatsApp non connecté — scannez le QR… ») affichable tel quel.
// Un numéro vide reste une vraie erreur INVALID_ARGUMENT (à garder côté front).
export const TESTER_ENVOI_WHATSAPP = gql`
  mutation TesterEnvoiWhatsapp($phoneNumber: String!) {
    testerEnvoiWhatsapp(phoneNumber: $phoneNumber) {
      success
      message
    }
  }
`;

// Révocation en masse des tokens d'accès abonnés (ADMIN).
// Renvoie le nombre de tokens révoqués.
export const REVOQUER_TOUS_TOKENS_ABONNES = gql`
  mutation RevoquerTousTokensAbonnes {
    revoquerTousTokensAbonnes
  }
`;

// Révocation d'un token d'accès abonné précis (ADMIN).
export const REVOQUER_TOKEN_ABONNE = gql`
  mutation RevoquerTokenAbonne($tokenId: String!) {
    revoquerTokenAbonne(tokenId: $tokenId)
  }
`;
