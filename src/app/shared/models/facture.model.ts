import type { BadgeTone } from '../components/badge/badge.component';

export type StatutFacture = 'IMPAYEE' | 'PARTIELLE' | 'PAYEE';
export type ModePaiement = 'ESPECES' | 'MOBILE_MONEY' | 'VIREMENT';

/** Teinte de la puce de statut d'une facture (source unique pour tous les écrans). */
export function factureStatutTone(statut: StatutFacture): BadgeTone {
  switch (statut) {
    case 'PAYEE':
      return 'success';
    case 'PARTIELLE':
      return 'info';
    case 'IMPAYEE':
      return 'danger';
  }
}

export interface Facture {
  factureId: string;
  numeroFacture: string;
  abonneId: string;
  campagneId: string;
  ancienIndex: number;
  nouveauIndex: number;
  consommation: number;
  prixM3: number;
  montant: number;
  statut: StatutFacture;
  dateReleve: string;
  dateLimitePaiement: string;
  dateGeneration: string;
  pdfPath: string;
  numeroMobileMoney: string;
  // Champs enrichis côté Gateway (jointure best-effort) : nom de l'abonné et
  // nom/période de la campagne. Permettent aux écrans factures/paiements de
  // s'afficher sans les queries `abonnes`/`campagnes` (refusées au COMPTABLE).
  abonneNom?: string;
  abonneNumero?: string;
  campagneNom?: string;
  campagnePeriodeMois?: number;
  campagnePeriodeAnnee?: number;
}

export interface SoldeFacture {
  factureId: string;
  montantTotal: number;
  montantPaye: number;
  soldeRestant: number;
  statut: StatutFacture;
}

export interface Paiement {
  paiementId: string;
  factureId: string;
  montant: number;
  datePaiement: string;
  modePaiement: ModePaiement;
  referenceTransaction: string;
  createdAt: string;
  /** Un paiement annulé reste visible mais ne compte dans aucun total. */
  annule: boolean;
  annuleLe: string | null;
  annulePar: string | null;
  motifAnnulation: string | null;
}

export interface EnregistrerPaiementInput {
  factureId: string;
  abonneId: string;
  montant: number;
  datePaiement: string;
  modePaiement: ModePaiement;
  referenceTransaction?: string;
}

export interface Envoi {
  envoiId: string;
  factureId: string;
  abonneId?: string;
  statut: string;
  dateEnvoi: string;
  typeEnvoi?: string;
  erreur: string;
  /** Motif d'échec renvoyé par la passerelle WhatsApp (numéro injoignable…). */
  raisonEchec?: string | null;
}

export interface SuiviImpaye {
  suiviId: string;
  factureId: string;
  abonneId: string;
  dateDepassement: string;
  etapeActuelle: number;
  resoluLe: string;
}

export interface Tarif {
  tarifId: string;
  prixM3: number;
  dateEffet: string;
  isActive: boolean;
}
