import { gql } from '@apollo/client/core';

export const ENREGISTRER_PAIEMENT = gql`
  mutation EnregistrerPaiement(
    $factureId: String!
    $abonneId: String!
    $montant: Float!
    $datePaiement: String!
    $modePaiement: String!
    $referenceTransaction: String
  ) {
    enregistrerPaiement(
      factureId: $factureId
      abonneId: $abonneId
      montant: $montant
      datePaiement: $datePaiement
      modePaiement: $modePaiement
      referenceTransaction: $referenceTransaction
    ) {
      paiementId
      factureId
      montant
      datePaiement
      modePaiement
      referenceTransaction
      createdAt
    }
  }
`;

export const GENERER_FACTURES = gql`
  mutation GenererFactures($campagneId: String!, $envoyerWhatsappAuto: Boolean!) {
    genererFactures(campagneId: $campagneId, envoyerWhatsappAuto: $envoyerWhatsappAuto) {
      factureId
      numeroFacture
      abonneId
      montant
      statut
    }
  }
`;

export const ENVOYER_TOUTES_FACTURES_WHATSAPP = gql`
  mutation EnvoyerToutesFacturesWhatsapp($campagneId: String!) {
    envoyerToutesFacturesWhatsapp(campagneId: $campagneId)
  }
`;

export const ENVOYER_FACTURE_WHATSAPP = gql`
  mutation EnvoyerFactureWhatsapp($factureId: String!, $abonneId: String!) {
    envoyerFactureWhatsapp(factureId: $factureId, abonneId: $abonneId) {
      envoiId
      statut
      dateEnvoi
      erreur
    }
  }
`;

export const RENVOYER_FACTURE_WHATSAPP = gql`
  mutation RenvoyerFactureWhatsapp($factureId: String!) {
    renvoyerFactureWhatsapp(factureId: $factureId) {
      envoiId
      statut
      dateEnvoi
      erreur
    }
  }
`;

export const UPDATE_STATUT_FACTURE = gql`
  mutation UpdateStatutFacture($factureId: String!, $statut: String!) {
    updateStatutFacture(factureId: $factureId, statut: $statut) {
      factureId
      numeroFacture
      statut
      montant
      dateLimitePaiement
    }
  }
`;

export const UPDATE_TARIF = gql`
  mutation UpdateTarif($prixM3: Float!, $dateEffet: String!) {
    updateTarif(prixM3: $prixM3, dateEffet: $dateEffet) {
      tarifId
      prixM3
      dateEffet
      isActive
    }
  }
`;
