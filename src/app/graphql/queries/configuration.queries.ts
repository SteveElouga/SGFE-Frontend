import { gql } from '@apollo/client/core';

// QR de liaison WhatsApp (ADMIN uniquement).
// ready=true → compte déjà lié (number renseigné). Sinon qr = data-URL PNG
// à afficher ; le code tourne, re-poller ~5 s jusqu'à ready=true.
export const GET_WHATSAPP_QR = gql`
  query WhatsappQr {
    whatsappQr {
      ready
      qr
      number
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

// ── Souscriptions temps réel — PENDING BACKEND (message « souscriptions ») ────
// Faible fréquence de changement, mais utile pour la cohérence inter-admins.
// À brancher à la livraison (subscribeToMore sur l'écran Configuration).
export const CONFIG_UPDATED_SUB = gql`
  subscription ConfigUpdated($cle: String) {
    configUpdated(cle: $cle) {
      cle
      valeur
      description
    }
  }
`;

export const TARIF_UPDATED_SUB = gql`
  subscription TarifUpdated {
    tarifUpdated {
      tarifId
      prixM3
      dateEffet
      isActive
    }
  }
`;
