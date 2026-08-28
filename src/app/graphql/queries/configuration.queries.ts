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
      phase
      depuisMs
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

// ── Souscriptions temps réel ──────────────────────────────────────────────────
// Branchées sur l'écran Configuration. Faible fréquence, mais le tarif décide de
// chaque montant facturé : deux admins qui le changent à quelques minutes
// d'écart s'écrasent en silence. Règle appliquée côté écran : une saisie en
// cours gagne toujours sur un événement distant.
// Le service `config` ne publie pas sur `UpdateInfosSociete` — nom, adresse et
// téléphone de la régie ne remontent donc pas par ce flux.
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
