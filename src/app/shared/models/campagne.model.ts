import type { BadgeTone } from '../components/badge/badge.component';

export type StatutCampagne = 'PLANIFIEE' | 'EN_COURS' | 'CLOTUREE';
export type StatutReleve = 'A_RELEVER' | 'RELEVE' | 'NON_RELEVE' | 'ESTIME';

/**
 * Teinte de la puce de statut d'une campagne.
 *
 * `string` et non `StatutCampagne`, pour la raison exposée sur
 * `factureStatutTone` : la gateway type `Campagne.statut` en `String`.
 */
export function campagneStatutTone(statut: string): BadgeTone {
  switch (statut) {
    case 'PLANIFIEE':
    case 'EN_COURS':
      return 'info';
    case 'CLOTUREE':
      return 'success';
    default:
      return 'neutral';
  }
}

/** Teinte de la puce de statut d'un relevé — même contrat que ci-dessus. */
export function releveStatutTone(statut: string): BadgeTone {
  switch (statut) {
    case 'RELEVE':
      return 'success';
    case 'ESTIME':
      return 'warning';
    case 'NON_RELEVE':
      return 'danger';
    case 'A_RELEVER':
    default:
      return 'neutral';
  }
}

export interface AgentZone {
  nom: string;
  camp: number;
}

/** Agent affectable (query `agentsDisponibles`, ADMIN + SUPERVISEUR). */
export interface AgentDisponible {
  id: string;
  username: string;
  phoneNumber: string;
  role: string;
  isActive: boolean;
}

/** Zone de relevé et nombre d'abonnés actifs (query `zonesDisponibles`). */
export interface ZoneDisponible {
  quartier: string;
  camp: number;
  nbAbonnes: number;
}

/** Zone à affecter à un agent (mutation `affecterZones`). */
export interface ZoneInput {
  quartier: string;
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
  /** userId de l'auteur — permet au dashboard Superviseur de filtrer "mes campagnes". */
  createdBy: string;
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
  // ── PR #92 (déployé) — identité de l'abonné jointe côté Gateway (best-effort :
  // Abonné Service indisponible → chaînes/valeurs vides, la query ne casse pas).
  // + snapshot de zone (quartier/camp). Permet à l'agent d'afficher les noms
  // sans accès direct au service Abonné (réservé ADMIN).
  abonneNom?: string;
  abonnePrenom?: string;
  numeroAbonne?: string;
  abonneAdresse?: string;
  numeroCompteur?: number | null;
  quartier?: string | null;
  camp?: number | null;
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
  /** Crée la campagne directement EN_COURS (au lieu de PLANIFIEE) en une seule
   *  opération atomique — évite un 2e appel demarrerCampagne non atomique (#11). */
  demarrerMaintenant?: boolean;
}

/** Résultat de `ajouterAbonnesCampagne` (rattachement idempotent). */
export interface AjouterAbonnesResult {
  nbAjoutes: number;
  nbIgnores: number;
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
