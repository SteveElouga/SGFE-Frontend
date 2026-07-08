import type { BadgeTone } from '../components/badge/badge.component';

export type StatutFacture = 'IMPAYEE' | 'PARTIELLE' | 'PAYEE';
export type ModePaiement = 'ESPECES' | 'CHEQUE' | 'MOBILE_MONEY' | 'VIREMENT';

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
  statut: string;
  dateEnvoi: string;
  typeEnvoi?: string;
  erreur: string;
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
