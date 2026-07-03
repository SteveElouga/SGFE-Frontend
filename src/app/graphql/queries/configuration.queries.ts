import { gql } from '@apollo/client/core';

// Session WhatsApp du compte dédié (ADMIN uniquement).
// connected=true → compte déjà lié (number renseigné, qr null).
// Sinon qr = data-URL PNG à afficher ; le code tourne, re-poller ~5 s.
// Une seule requête donne statut + numéro + QR (pas de query dédiée au QR).
export const GET_WHATSAPP_SESSION = gql`
  query WhatsappSession {
    whatsappSession {
      connected
      number
      qr
    }
  }
`;

export const GET_INFOS_SOCIETE = gql`
  query GetInfosSociete {
    infosSociete {
      nom
      adresse
      telephone
      logoPath
      updatedAt
    }
  }
`;

export const GET_CONFIGS = gql`
  query GetConfigs {
    configs {
      cle
      valeur
      description
    }
  }
`;
