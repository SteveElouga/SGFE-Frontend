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
/**
 * Pourquoi la liaison n'est pas prête.
 *
 * `ready: false` recouvrait deux situations qui appellent des messages
 * opposés — « le service démarre, patientez » et « la liaison est tombée, il
 * faut rescanner ». L'écran affichait la même attente sans fin dans les deux
 * cas, ce qui donne l'impression qu'il faut recharger pour voir le QR.
 */
export type PhaseWhatsapp = 'connecte' | 'qr' | 'demarrage' | 'rupture';

export interface WhatsappQr {
  /** true → compte déjà lié (number renseigné, qr null). */
  ready: boolean;
  /** QR d'appairage (data-URL PNG) — renseigné seulement si ready=false. */
  qr: string | null;
  /** Numéro du compte lié — renseigné seulement si ready=true. */
  number: string | null;
  phase?: PhaseWhatsapp | string;
  /** Millisecondes depuis la dernière connexion réussie (0 si jamais). */
  depuisMs?: number;
}

/** Résultat d'un envoi de test WhatsApp (mutation `testerEnvoiWhatsapp`). */
export interface TestEnvoiResult {
  success: boolean;
  /** Message affichable tel quel (succès ou motif exact de l'échec). */
  message: string;
}
