import { gql } from '@apollo/client/core';

// Statut de liaison WhatsApp — instantané en HTTP (ADMIN, type WhatsAppQr).
//
// Cette query avait été retirée quand la souscription est arrivée : « remplace le
// polling de whatsappQr ». Pour les mises à jour en direct, oui. Mais elle était
// aussi le SEUL chemin qui fonctionne sans WebSocket — et sans elle, un
// WebSocket muet laisse l'écran sur « Récupération du QR code… » indéfiniment.
//
// Constaté en vrai : un serveur de développement démarré avant que `ws: true`
// n'entre dans `proxy.conf.json` ne relaie pas la montée en WebSocket. Tout le
// backend livrait le QR ; l'écran tournait dans le vide.
//
// Elle revient donc comme socle : on peint d'abord avec elle, la souscription
// corrige ensuite. Le temps réel devient un supplément, pas un prérequis.
export const WHATSAPP_QR_QUERY = gql`
  query WhatsappQr {
    whatsappQr {
      ready
      qr
      number
      phase
      depuisMs
    }
  }
`;

// Statut de liaison WhatsApp poussé en temps réel (ADMIN, type WhatsAppQr).
// Le gateway envoie un snapshot initial puis pousse à chaque changement d'état
// (ready/qr/number) via WebSocket.
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
