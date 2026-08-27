import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  GET_FACTURES_PAR_CAMPAGNE,
  GET_FACTURES,
  GET_FACTURE,
  GET_AVOIR_ABONNE,
  GET_SOLDE_FACTURE,
  GET_PAIEMENTS,
  GET_ENVOIS,
  GET_ALL_ENVOIS,
  GET_TARIF_ACTUEL,
} from '../../graphql/queries/factures.queries';
import {
  GET_ALL_PAIEMENTS,
  GET_IMPAYES,
  GET_SUIVI_IMPAYE,
  GET_DETTE_ABONNE,
} from '../../graphql/queries/paiements.queries';
import {
  ENREGISTRER_PAIEMENT,
  ENVOYER_FACTURE_WHATSAPP,
  ENVOYER_TOUTES_FACTURES_WHATSAPP,
  GENERER_FACTURES,
  RENVOYER_ENVOI,
  RENVOYER_FACTURE_WHATSAPP,
  UPDATE_STATUT_FACTURE,
  UPDATE_TARIF,
  ANNULER_FACTURE,
  CREER_REGULARISATION,
  REGENERER_FACTURE,
  ENREGISTRER_PAIEMENT_ABONNE,
} from '../../graphql/mutations/factures.mutations';
import {
  Avoir,
  Envoi,
  RegenerationFacture,
  EnregistrerPaiementInput,
  Facture,
  Paiement,
  SoldeFacture,
  StatutFacture,
  SuiviImpaye,
  Tarif,
  DetteAbonne,
  PaiementAbonne,
} from '../../shared/models/facture.model';

/**
 * Accès GraphQL au domaine facturation & encaissement : factures (par campagne,
 * détail, statut), soldes et impayés, paiements, envois WhatsApp, génération des
 * factures et tarif courant. Singleton (`providedIn: 'root'`).
 */
@Injectable({ providedIn: 'root' })
export class FacturesService {
  private readonly apollo = inject(Apollo);

  /**
   * Cache mémoire pour `getFactures()` : évite les doublons quand plusieurs
   * appelants (composant qui redirect puis re-mount, background loaders)
   * demandent la même vue globale en <30s. Invalidé automatiquement après
   * chaque mutation qui modifie les factures (enregistrer/générer/statut/WA).
   * TTL court car nouvelles factures apparaissent vite en production.
   */
  private facturesCache: { key: string; data: Facture[]; ts: number } | null = null;
  private static readonly CACHE_TTL_MS = 30_000;

  private invalidateFacturesCache(): void {
    this.facturesCache = null;
  }

  async getFacturesParCampagne(campagneId: string): Promise<Facture[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ facturesParCampagne: Facture[] }>({
        query: GET_FACTURES_PAR_CAMPAGNE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.facturesParCampagne;
  }

  async getFacture(factureId: string): Promise<Facture> {
    const result = await firstValueFrom(
      this.apollo.query<{ facture: Facture }>({
        query: GET_FACTURE,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.facture;
  }

  /**
   * Avoir disponible d'un abonné, avec son journal.
   *
   * Le serveur tient ce compte depuis le début — un versement supérieur à la
   * dette y est porté, et il s'impute de lui-même sur la facture suivante. Rien
   * ne l'affichait : l'abonné voyait un montant réduit qu'aucun écran
   * n'expliquait, et le caissier encaissait sans savoir qu'il restait du crédit.
   */
  async getAvoirAbonne(abonneId: string): Promise<Avoir> {
    const result = await firstValueFrom(
      this.apollo.query<{ avoirAbonne: Avoir }>({
        query: GET_AVOIR_ABONNE,
        variables: { abonneId },
      }),
    );
    return result.data!.avoirAbonne;
  }

  /**
   * Annule une facture sans l'effacer.
   *
   * Elle reste au journal avec son numéro : une numérotation comptable dont des
   * numéros disparaissent n'est plus une numérotation, et le trou est
   * précisément ce qui prouve qu'on a effacé quelque chose. Ce que l'abonné
   * avait versé revient à son avoir, d'où il s'imputera sur la suite.
   */
  async annulerFacture(factureId: string, motif: string): Promise<Facture> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ annulerFacture: Facture }>({
        mutation: ANNULER_FACTURE,
        variables: { factureId, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.annulerFacture;
  }

  /**
   * Annule une facture et en émet une corrigée depuis le relevé actuel.
   *
   * Le relevé est relu côté serveur, jamais recopié : c'est ce qui permet à une
   * correction d'index de produire la facture juste plutôt que de reproduire
   * l'erreur. L'abonné retrouve son versement sans que personne ne le
   * ressaisisse — il passe par l'avoir et revient sur la nouvelle facture.
   */
  async regenererFacture(factureId: string, motif: string): Promise<RegenerationFacture> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ regenererFacture: RegenerationFacture }>({
        mutation: REGENERER_FACTURE,
        variables: { factureId, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.regenererFacture;
  }

  async getSoldeFacture(factureId: string): Promise<SoldeFacture> {
    const result = await firstValueFrom(
      this.apollo.query<{ soldeFacture: SoldeFacture }>({
        query: GET_SOLDE_FACTURE,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.soldeFacture;
  }

  async getPaiements(factureId: string): Promise<Paiement[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ paiements: Paiement[] }>({
        query: GET_PAIEMENTS,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.paiements;
  }

  async getEnvois(factureId: string): Promise<Envoi[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ envois: Envoi[] }>({
        query: GET_ENVOIS,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.envois;
  }

  /** Historique global des envois WhatsApp (écran Envois) — ADMIN, COMPTABLE. */
  async getAllEnvois(): Promise<Envoi[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ envois: Envoi[] }>({
        query: GET_ALL_ENVOIS,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.envois;
  }

  async genererFactures(campagneId: string, envoyerWhatsappAuto: boolean): Promise<Facture[]> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ genererFactures: Facture[] }>({
        mutation: GENERER_FACTURES,
        variables: { campagneId, envoyerWhatsappAuto },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.genererFactures;
  }

  async envoyerToutesFacturesWhatsapp(campagneId: string): Promise<void> {
    await firstValueFrom(
      this.apollo.mutate({
        mutation: ENVOYER_TOUTES_FACTURES_WHATSAPP,
        variables: { campagneId },
      }),
    );
    this.invalidateFacturesCache();
  }

  async envoyerFactureWhatsapp(factureId: string, abonneId: string): Promise<Envoi> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ envoyerFactureWhatsapp: Envoi }>({
        mutation: ENVOYER_FACTURE_WHATSAPP,
        variables: { factureId, abonneId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.envoyerFactureWhatsapp;
  }

  async renvoyerFactureWhatsapp(factureId: string): Promise<Envoi> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ renvoyerFactureWhatsapp: Envoi }>({
        mutation: RENVOYER_FACTURE_WHATSAPP,
        variables: { factureId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.renvoyerFactureWhatsapp;
  }

  /** Rejoue un envoi précis par son id (variante unitaire de renvoiement). */
  async renvoyerEnvoi(envoiId: string): Promise<Envoi> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ renvoyerEnvoi: Envoi }>({
        mutation: RENVOYER_ENVOI,
        variables: { envoiId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.renvoyerEnvoi;
  }

  async enregistrerPaiement(input: EnregistrerPaiementInput): Promise<Paiement> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ enregistrerPaiement: Paiement }>({
        mutation: ENREGISTRER_PAIEMENT,
        variables: {
          factureId: input.factureId,
          abonneId: input.abonneId,
          montant: input.montant,
          datePaiement: input.datePaiement,
          modePaiement: input.modePaiement,
          referenceTransaction: input.referenceTransaction,
        },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.enregistrerPaiement;
  }

  async getAllPaiements(): Promise<Paiement[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ paiements: Paiement[] }>({
        query: GET_ALL_PAIEMENTS,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.paiements;
  }

  async getImpayes(): Promise<SoldeFacture[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ impayes: SoldeFacture[] }>({
        query: GET_IMPAYES,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.impayes;
  }

  async getSuiviImpaye(factureId: string): Promise<SuiviImpaye> {
    const result = await firstValueFrom(
      this.apollo.query<{ suiviImpaye: SuiviImpaye }>({
        query: GET_SUIVI_IMPAYE,
        variables: { factureId },
        // L'escalade des relances avance toute seule, par cron.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.suiviImpaye;
  }

  async getFactures(params: {
    campagneId?: string;
    abonneId?: string;
    statut?: string;
  } = {}): Promise<Facture[]> {
    const key = JSON.stringify(params);
    const now = Date.now();
    if (
      this.facturesCache &&
      this.facturesCache.key === key &&
      now - this.facturesCache.ts < FacturesService.CACHE_TTL_MS
    ) {
      return this.facturesCache.data;
    }
    const result = await firstValueFrom(
      this.apollo.query<{ factures: Facture[] }>({
        query: GET_FACTURES,
        variables: params,
        fetchPolicy: 'network-only',
      }),
    );
    const data = result.data!.factures;
    this.facturesCache = { key, data, ts: now };
    return data;
  }

  /** Ce qu'un abonné doit encore, hors une facture donnée. */
  async getDetteAbonne(abonneId: string, horsFactureId?: string): Promise<DetteAbonne> {
    const result = await firstValueFrom(
      this.apollo.query<{ detteAbonne: DetteAbonne }>({
        query: GET_DETTE_ABONNE,
        variables: { abonneId, horsFactureId: horsFactureId ?? null },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.detteAbonne;
  }

  /**
   * Constate une dette antérieure à la mise en service.
   *
   * Rafraîchit tout ce qui compte une dette : la liste des factures, les
   * impayés et le tableau de bord. Sans cela, l'arriéré resterait invisible
   * jusqu'à un rechargement — le défaut qu'on vient de corriger sur la
   * création d'abonné.
   */
  async creerRegularisation(input: {
    abonneId: string;
    montant: number;
    motif: string;
    dateLimitePaiement?: string;
  }): Promise<Facture> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ creerRegularisation: Facture }>({
        mutation: CREER_REGULARISATION,
        variables: { ...input, dateLimitePaiement: input.dateLimitePaiement ?? null },
        refetchQueries: [{ query: GET_FACTURES, variables: { abonneId: input.abonneId } }],
        awaitRefetchQueries: true,
      }),
    );
    this.facturesCache = null;
    const facture = result.data?.creerRegularisation;
    if (!facture) throw new Error('Réponse invalide du serveur');
    return facture;
  }

  /**
   * Encaisse un versement au nom d'un abonné, imputé du plus ancien au plus récent.
   *
   * Retourne la ventilation réelle : une écriture par facture touchée. Le
   * caissier doit voir ce qui s'est passé, pas seulement que ça s'est passé.
   */
  async enregistrerPaiementAbonne(input: {
    abonneId: string;
    montant: number;
    datePaiement: string;
    modePaiement: string;
    referenceTransaction?: string;
  }): Promise<PaiementAbonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ enregistrerPaiementAbonne: PaiementAbonne }>({
        mutation: ENREGISTRER_PAIEMENT_ABONNE,
        variables: { ...input, referenceTransaction: input.referenceTransaction ?? '' },
      }),
    );
    this.facturesCache = null;
    const res = result.data?.enregistrerPaiementAbonne;
    if (!res) throw new Error('Réponse invalide du serveur');
    return res;
  }

  /**
   * Simule la ventilation d'un montant sans rien écrire.
   *
   * L'imputation automatique n'a de valeur que si le caissier voit ce qu'elle
   * va faire avant de valider : elle lui évite de décider, elle ne doit pas lui
   * cacher la décision. Le calcul reprend la règle du backend — le solde le
   * plus anciennement exigible d'abord.
   */
  previsualiserImputation(
    montant: number,
    soldes: ReadonlyArray<{ factureId: string; numeroFacture: string; soldeRestant: number; dateLimitePaiement: string }>,
  ): Array<{ factureId: string; numeroFacture: string; part: number; dateLimitePaiement: string }> {
    const ordonnes = [...soldes]
      .filter((s) => s.soldeRestant > 0)
      // Une échéance absente passe en dernier plutôt que de faire tomber
      // l'écran : mieux vaut une ventilation approximative qu'un plantage.
      .sort((a, b) => (a.dateLimitePaiement || '9999').localeCompare(b.dateLimitePaiement || '9999'));
    const parts: Array<{ factureId: string; numeroFacture: string; part: number; dateLimitePaiement: string }> = [];
    let restant = montant;
    for (const s of ordonnes) {
      if (restant <= 0) break;
      const part = Math.min(restant, s.soldeRestant);
      parts.push({ factureId: s.factureId, numeroFacture: s.numeroFacture, part, dateLimitePaiement: s.dateLimitePaiement });
      restant -= part;
    }
    return parts;
  }

  async getTarifActuel(): Promise<Tarif | null> {
    const result = await firstValueFrom(
      this.apollo.query<{ tarifActuel: Tarif | null }>({
        query: GET_TARIF_ACTUEL,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.tarifActuel;
  }

  async updateStatutFacture(factureId: string, statut: StatutFacture): Promise<Facture> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateStatutFacture: Facture }>({
        mutation: UPDATE_STATUT_FACTURE,
        variables: { factureId, statut },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.updateStatutFacture;
  }

  async updateTarif(prixM3: number, dateEffet: string): Promise<Tarif> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateTarif: Tarif }>({
        mutation: UPDATE_TARIF,
        variables: { prixM3, dateEffet },
      }),
    );
    return result.data!.updateTarif;
  }
}
