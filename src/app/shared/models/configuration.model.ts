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

/** Session WhatsApp du compte dédié (query `whatsappSession`). */
export interface WhatsappSession {
  connected: boolean;
  /** Numéro du compte lié — renseigné seulement si connected=true. */
  number: string | null;
  /** QR d'appairage (data-URL PNG) — renseigné seulement si connected=false. */
  qr: string | null;
}

/** Résultat d'un envoi de test WhatsApp (mutation `testerEnvoiWhatsapp`). */
export interface TestEnvoiResult {
  success: boolean;
  /** Message affichable tel quel (succès ou motif exact de l'échec). */
  message: string;
}
