import { gql } from '@apollo/client/core';

// Statut de liaison WhatsApp poussé en temps réel (ADMIN, type WhatsAppQr).
// Le gateway envoie un snapshot initial puis pousse à chaque changement d'état
// (ready/qr/number) via WebSocket — remplace le polling de whatsappQr.
export const WHATSAPP_STATUS_SUB = gql`
  subscription WhatsappStatus {
    whatsappStatus {
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
