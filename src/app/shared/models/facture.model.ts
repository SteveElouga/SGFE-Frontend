import type { BadgeTone } from '../components/badge/badge.component';

/**
 * `ANNULEE` n'est pas un quatrième état de paiement mais la sortie du circuit :
 * la facture reste au journal avec son numéro, sa dette n'existe plus, et ce
 * qui avait été versé dessus est revenu à l'avoir de l'abonné.
 */
export type StatutFacture = 'IMPAYEE' | 'PARTIELLE' | 'PAYEE' | 'ANNULEE';
export type ModePaiement = 'ESPECES' | 'MOBILE_MONEY' | 'VIREMENT';

/** Teinte de la puce de statut d'une facture (source unique pour tous les écrans). */
export function factureStatutTone(statut: StatutFacture): BadgeTone {
  switch (statut) {
    case 'PAYEE':
      return 'success';
    case 'PARTIELLE':
      return 'info';
    case 'IMPAYEE':
      return 'danger';
    // Neutre à dessein : une facture annulée n'appelle aucune action et ne
    // porte aucune urgence. Lui donner une couleur d'alerte la ferait
    // ressortir d'une liste qu'elle n'a plus vocation à peupler.
    case 'ANNULEE':
      return 'neutral';
  }
}

export interface Facture {
  factureId: string;
  numeroFacture: string;
  abonneId: string;
  campagneId: string;
  ancienIndex: number;
  nouveauIndex: number;
  consommation: number;
  prixM3: number;
  montant: number;
  statut: StatutFacture;
  dateReleve: string;
  dateLimitePaiement: string;
  dateGeneration: string;
  pdfPath: string;
  numeroMobileMoney: string;
  // Champs enrichis côté Gateway (jointure best-effort) : nom de l'abonné et
  // nom/période de la campagne. Permettent aux écrans factures/paiements de
  // s'afficher sans les queries `abonnes`/`campagnes` (refusées au COMPTABLE).
  abonneNom?: string;
  abonneNumero?: string;
  campagneNom?: string;
  campagnePeriodeMois?: number;
  campagnePeriodeAnnee?: number;
}

export interface SoldeFacture {
  factureId: string;
  montantTotal: number;
  montantPaye: number;
  soldeRestant: number;
  statut: StatutFacture;
  abonneId: string;
  dateLimitePaiement: string;
  /**
   * Part du montant payé venue d'un avoir plutôt que d'un versement.
   *
   * Sans elle, l'écran montre un « déjà réglé » que l'abonné ne se souvient pas
   * d'avoir versé — et un reste à payer inférieur à sa consommation sans rien
   * qui l'explique.
   */
  avoirImpute?: number;
}

export interface Paiement {
  paiementId: string;
  factureId: string;
  montant: number;
  datePaiement: string;
  modePaiement: ModePaiement;
  referenceTransaction: string;
  createdAt: string;
  /** Un paiement annulé reste visible mais ne compte dans aucun total. */
  annule: boolean;
  annuleLe: string | null;
  annulePar: string | null;
  motifAnnulation: string | null;
}

export interface EnregistrerPaiementInput {
  factureId: string;
  abonneId: string;
  montant: number;
  datePaiement: string;
  modePaiement: ModePaiement;
  referenceTransaction?: string;
}

export interface Envoi {
  envoiId: string;
  factureId: string;
  abonneId?: string;
  statut: string;
  dateEnvoi: string;
  typeEnvoi?: string;
  erreur: string;
  /** Motif d'échec renvoyé par la passerelle WhatsApp (numéro injoignable…). */
  raisonEchec?: string | null;
}

export interface SuiviImpaye {
  suiviId: string;
  factureId: string;
  abonneId: string;
  dateDepassement: string;
  etapeActuelle: number;
  resoluLe: string;
}

export interface Tarif {
  tarifId: string;
  prixM3: number;
  dateEffet: string;
  isActive: boolean;
}

/**
 * Ce qu'un abonné doit encore, toutes factures confondues.
 *
 * `plusAncienneEcheance` porte l'âge de la dette — c'est lui qui fait payer,
 * pas le montant. `null` quand l'abonné est à jour.
 */
export interface DetteAbonne {
  totalDu: number;
  nbFactures: number;
  plusAncienneEcheance: string | null;
}

/**
 * Résultat d'un encaissement au niveau abonné.
 *
 * `paiements` porte la ventilation réelle — une écriture par facture touchée,
 * de la plus ancienne à la plus récente.
 */
export interface PaiementAbonne {
  paiements: Paiement[];
  excedentEnAvoir: number;
}

/** Un mouvement du compte d'avoir d'un abonné. */
export interface MouvementAvoir {
  montant: number;
  /**
   * `TROP_PERCU` (versement supérieur à la dette) · `RECTIFICATION` (avoir
   * accordé à la main) · `ANNULATION` (facture annulée sous un versement) ·
   * `IMPUTATION` (avoir appliqué à une facture — un débit).
   */
  typeMouvement: string;
  motif: string;
  factureId: string;
  creePar: string;
  createdAt: string;
}

/**
 * L'avoir d'un abonné : ce que la régie lui doit.
 *
 * C'est l'exact symétrique du solde impayé, et il se lit dans le même geste —
 * un caissier qui encaisse doit savoir si l'abonné a déjà de l'argent chez
 * nous, faute de quoi il le fait payer deux fois.
 */
export interface Avoir {
  abonneId: string;
  montant: number;
  mouvements: MouvementAvoir[];
}
