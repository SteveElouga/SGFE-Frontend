import type { BadgeTone } from '../components/badge/badge.component';

export type StatutAbonne = 'ACTIF' | 'SUSPENDU' | 'RESILIE';
export type StatutCompteur = 'ACTIF' | 'REMPLACE' | 'DESACTIVE';

/**
 * Teinte de la puce de statut d'un abonné — même correspondance que `TONS`
 * dans `StatusBadgeComponent` (ACTIF/SUSPENDU/RESILIE), extraite ici en
 * fonction pure pour être réutilisée hors du gabarit de ce composant (écran
 * Carte : couleur des repères par statut de l'abonné rattaché au compteur —
 * voir `features/carte`). Même pattern que `factureStatutTone`/`campagneStatutTone`.
 */
export function abonneStatutTone(statut: StatutAbonne | string): BadgeTone {
  switch (statut) {
    case 'ACTIF':
      return 'success';
    case 'SUSPENDU':
      return 'warning';
    case 'RESILIE':
      return 'danger';
    default:
      return 'neutral';
  }
}

export interface Compteur {
  id: string;
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  datePose: string;
  position: string;
  statut: StatutCompteur;
  /** Géolocalisation (PR backend #243) — `null` tant que le compteur n'a
   *  jamais été géolocalisé (import CSV, écran Carte). */
  latitude: number | null;
  longitude: number | null;
  dateMajPosition: string | null;
}

export interface CompteurSnapshot {
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  position: string;
}

export interface HistoriqueCompteurEntry {
  id: string;
  indexFermeture: number;
  dateRemplacement: string;
  createdAt: string;
  ancienCompteur: CompteurSnapshot;
  nouveauCompteur: CompteurSnapshot;
}

export interface Abonne {
  id: string;
  numeroAbonne: string;
  nom: string;
  prenom: string;
  telephoneWhatsapp: string;
  adresse?: string;
  statut: StatutAbonne;
  compteur?: Compteur;
  createdAt: string;
  soldeImpayes?: number | null;
}
