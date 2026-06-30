export interface InfosSociete {
  nom: string;
  adresse: string;
  telephone: string;
  logoPath: string;
  updatedAt: string;
}

export interface UpdateInfosSocieteInput {
  nom: string;
  adresse: string;
  telephone: string;
  logoPath: string;
}

export interface ConfigParam {
  cle: string;
  valeur: string;
  description: string;
}
