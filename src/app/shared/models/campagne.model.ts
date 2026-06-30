export type StatutCampagne = 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';

export interface CampagneActive {
  id: string;
  periodeMois: number;
  periodeAnnee: number;
  totalAbonnes: number;
  nbReleves: number;
  pourcentage: number;
}

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function formatPeriodeCampagne(mois: number, annee: number): string {
  return `${MOIS[mois - 1] ?? mois} ${annee}`;
}
