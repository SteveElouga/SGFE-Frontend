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

/** État de liaison WhatsApp du compte dédié (subscription `whatsappStatus`, type WhatsAppQr). */
export interface WhatsappQr {
  /** true → compte déjà lié (number renseigné, qr null). */
  ready: boolean;
  /** QR d'appairage (data-URL PNG) — renseigné seulement si ready=false. */
  qr: string | null;
  /** Numéro du compte lié — renseigné seulement si ready=true. */
  number: string | null;
}

/** Résultat d'un envoi de test WhatsApp (mutation `testerEnvoiWhatsapp`). */
export interface TestEnvoiResult {
  success: boolean;
  /** Message affichable tel quel (succès ou motif exact de l'échec). */
  message: string;
}
