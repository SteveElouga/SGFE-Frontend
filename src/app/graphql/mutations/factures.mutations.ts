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

// Rejoue un envoi précis (par son id) — variante unitaire de renvoiement.
export const RENVOYER_ENVOI = gql`
  mutation RenvoyerEnvoi($envoiId: String!) {
    renvoyerEnvoi(envoiId: $envoiId) {
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

/**
 * Constate à la main une dette antérieure à la mise en service.
 *
 * Le motif est obligatoire : le montant d'une régularisation est **déclaré**,
 * aucun index ne le justifie, et le motif en est la seule trace.
 */
export const CREER_REGULARISATION = gql`
  mutation CreerRegularisation(
    $abonneId: String!
    $montant: Float!
    $motif: String!
    $dateLimitePaiement: String
  ) {
    creerRegularisation(
      abonneId: $abonneId
      montant: $montant
      motif: $motif
      dateLimitePaiement: $dateLimitePaiement
    ) {
      factureId
      numeroFacture
      montant
      statut
      dateLimitePaiement
    }
  }
`;

/**
 * Encaisse un versement au nom d'un abonné, imputé du plus ancien au plus récent.
 *
 * La réponse porte la **ventilation réelle** : une écriture par facture touchée.
 * C'est elle qui permet de montrer au caissier ce qui vient de se passer, et
 * pas seulement que ça s'est passé.
 */
export const ENREGISTRER_PAIEMENT_ABONNE = gql`
  mutation EnregistrerPaiementAbonne(
    $abonneId: String!
    $montant: Float!
    $datePaiement: String!
    $modePaiement: String!
    $referenceTransaction: String
  ) {
    enregistrerPaiementAbonne(
      abonneId: $abonneId
      montant: $montant
      datePaiement: $datePaiement
      modePaiement: $modePaiement
      referenceTransaction: $referenceTransaction
    ) {
      excedentEnAvoir
      paiements {
        paiementId
        factureId
        montant
        modePaiement
        datePaiement
      }
    }
  }
`;
