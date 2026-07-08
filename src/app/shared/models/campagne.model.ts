import type { BadgeTone } from '../components/badge/badge.component';

export type StatutCampagne = 'PLANIFIEE' | 'EN_COURS' | 'CLOTUREE';
export type StatutReleve = 'A_RELEVER' | 'RELEVE' | 'NON_RELEVE' | 'ESTIME';

/** Teinte de la puce de statut d'une campagne. */
export function campagneStatutTone(statut: StatutCampagne): BadgeTone {
  switch (statut) {
    case 'PLANIFIEE':
    case 'EN_COURS':
      return 'info';
    case 'CLOTUREE':
      return 'success';
  }
}

/** Teinte de la puce de statut d'un relevé. */
export function releveStatutTone(statut: StatutReleve): BadgeTone {
  switch (statut) {
    case 'RELEVE':
      return 'success';
    case 'ESTIME':
      return 'warning';
    case 'NON_RELEVE':
      return 'danger';
    case 'A_RELEVER':
      return 'neutral';
  }
}

export interface AgentZone {
  nom: string;
  camp: number;
}

export interface CampagneAgent {
  username: string;
  // ── PENDING BACKEND (docs/BESOINS_API_campagne_agents.md, P1 + P4) ─────────
  // Le type `Campagne` n'expose pas encore `agents` : ces champs restent vides
  // tant que le backend ne les fournit pas. La section « Agents affectés » du
  // détail campagne affiche alors un état « en attente ». Ne PAS ajouter ces
  // champs à GET_CAMPAGNE avant leur exposition (champ inconnu = query cassée).
  id?: string;
  zones?: AgentZone[];
  statutTournee?: 'EN_TOURNEE' | 'ACTIF' | 'EN_RETARD' | 'INACTIF';
  derniereSyncLe?: string;
  nbAbonnesAssignes?: number;
  nbReleves?: number;
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

// ── Agents affectés & répartition par zone (queries backend dédiées) ─────────
export interface ZoneStat {
  quartier: string;
  camp: number | null;
}

/** Agent affecté à une campagne (query `agentsCampagne`). */
export interface AgentAffecte {
  agentId: string;
  username: string;
  role: string;
  statut: string | null; // EN_TOURNEE | ACTIF | EN_RETARD | INACTIF (chaîne backend)
  derniereActivite: string | null;
  nbReleves: number;
  zones: ZoneStat[];
}

/** Ligne de répartition par zone (query `repartitionParZone`). */
export interface ZoneRepartition {
  quartier: string;
  camp: number | null;
  agentId: string | null;
  agentUsername: string | null;
  nbAbonnes: number;
  nbReleves: number;
  pct: number;
}

export interface Progression {
  campagneId: string;
  totalAbonnes: number;
  nbReleves: number;
  nbEnAttente: number;
  pourcentage: number;
}

/** Ventilation autoritative pour la modale de clôture (écran 18). */
export interface ResumeCloture {
  campagneId: string;
  totalAbonnes: number;
  nbReleves: number;
  nbEstimes: number;
  nbNonReleves: number;
  nbRestants: number;
  nbFacturesAGenerer: number;
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
