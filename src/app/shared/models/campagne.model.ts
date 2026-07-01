export type StatutCampagne = 'PLANIFIEE' | 'EN_COURS' | 'CLOTUREE';
export type StatutReleve = 'A_RELEVER' | 'RELEVE' | 'NON_RELEVE' | 'ESTIME';

export interface CampagneAgent {
  username: string;
}

export interface Campagne {
  campagneId: string;
  nom: string;
  periodeMois: number;
  periodeAnnee: number;
  statut: StatutCampagne;
  datePlanifiee: string;
  dateCreation: string;
  dateCloture: string;
  agents?: CampagneAgent[];
}

export interface ReleveAbonne {
  nom: string;
  prenom: string;
  quartier: string;
  camp: number;
}

export interface Releve {
  releveId: string;
  abonneId: string;
  abonne?: ReleveAbonne;
  ancienIndex: number;
  nouveauIndex: number;
  consommation: number;
  dateReleve: string;
  observation: string;
  statut: StatutReleve;
}

export interface Progression {
  campagneId: string;
  totalAbonnes: number;
  nbReleves: number;
  nbEnAttente: number;
  pourcentage: number;
}

export interface DernierIndex {
  abonneId: string;
  dernierIndex: number;
  estIndexInitial: boolean;
}

export interface CreateCampagneInput {
  nom: string;
  periodeMois: number;
  periodeAnnee: number;
  datePlanifiee: string;
  filtreZones?: string[]; // pending backend: CreateCampagneInput.filtreZones
}

export interface SaisirIndexInput {
  campagneId: string;
  abonneId: string;
  nouveauIndex: number;
  observation: string;
}

export interface MarquerNonReleveInput {
  campagneId: string;
  abonneId: string;
  statut: 'NON_RELEVE' | 'ESTIME';
  observation: string;
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MOIS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatPeriodeCampagne(mois: number, annee: number, lang = 'fr'): string {
  const noms = lang === 'en' ? MOIS_EN : MOIS_FR;
  return `${noms[mois - 1] ?? mois} ${annee}`;
}

// Sidebar compat — champ id → campagneId
export interface CampagneActive {
  campagneId: string;
  periodeMois: number;
  periodeAnnee: number;
  totalAbonnes: number;
  nbReleves: number;
  pourcentage: number;
}
