export type StatutAbonne = 'ACTIF' | 'SUSPENDU' | 'RESILIE';
export type StatutCompteur = 'ACTIF' | 'REMPLACE' | 'DESACTIVE';

export interface Compteur {
  id: string;
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  datePose: string;
  statut: StatutCompteur;
}

export interface CompteurSnapshot {
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
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
