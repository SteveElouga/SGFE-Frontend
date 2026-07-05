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
  numeroMobileMoney?: string;
  genererFacturesAuto?: boolean;
  envoyerWhatsappAuto?: boolean;
  agents?: CampagneAgent[];
}

export interface Auteur {
  id: string;
  username: string;
  role: 'ADMIN' | 'AGENT' | 'SUPERVISEUR';
}

export interface ReleveAudit {
  action: 'SAISIE' | 'CORRECTION';
  auteur: Auteur;
  ancienIndex: number;
  nouvelIndex: number;
  horodatage: string;
}

export interface Releve {
  releveId: string;
  abonneId: string;
  ancienIndex: number;
  nouveauIndex: number;
  consommation: number;
  dateReleve: string;
  observation: string;
  statut: StatutReleve;
  // ── PR #68 (PENDING DEPLOY) — audit & correction de relevé ────────────────
  // Champs optionnels : non demandés par les queries actuelles tant que le
  // backend n'est pas déployé (un champ inconnu casserait toute la query).
  agentId?: string; // P3 : agent/admin ayant saisi (écran « tournée »)
  saisiPar?: Auteur | null; // P1 : auteur de la saisie initiale
  saisiLe?: string; // P1 : ISO 8601 de la saisie
  audit?: ReleveAudit[]; // P2 : journal complet (saisie + corrections)
}

export interface CorrigerReleveInput {
  campagneId: string;
  abonneId: string;
  nouveauIndex: number;
  observation?: string;
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
  numeroMobileMoney?: string;
  genererFacturesAuto?: boolean;
  envoyerWhatsappAuto?: boolean;
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
