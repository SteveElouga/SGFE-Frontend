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
  ENVOYER_RECU_PAIEMENT,
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
  ANNULER_PAIEMENT,
  CREDITER_AVOIR,
} from '../../graphql/mutations/factures.mutations';
import { Avoir, EnregistrerPaiementInput, StatutFacture, Tarif } from '../../shared/models/facture.model';
import type { AnnulerFactureMutation, AnnulerPaiementMutation, CrediterAvoirMutation, CreerRegularisationMutation, EnregistrerPaiementAbonneMutation, EnregistrerPaiementMutation, EnvoyerFactureWhatsappMutation, EnvoyerRecuPaiementMutation, GenererFacturesMutation, GetAllEnvoisQuery, GetAllPaiementsQuery, GetAvoirAbonneQuery, GetDetteAbonneQuery, GetEnvoisQuery, GetFactureQuery, GetFacturesParCampagneQuery, GetFacturesQuery, GetImpayesQuery, GetPaiementsQuery, GetSoldeFactureQuery, GetSuiviImpayeQuery, GetTarifActuelQuery, RegenererFactureMutation, RenvoyerEnvoiMutation, RenvoyerFactureWhatsappMutation, UpdateStatutFactureMutation, UpdateTarifMutation } from '../../graphql/generated';

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
  private facturesCache: { key: string; data: GetFacturesQuery['factures']; ts: number } | null = null;
  private static readonly CACHE_TTL_MS = 30_000;

  private invalidateFacturesCache(): void {
    this.facturesCache = null;
  }

  async getFacturesParCampagne(campagneId: string): Promise<GetFacturesParCampagneQuery['facturesParCampagne']> {
    const result = await firstValueFrom(
      this.apollo.query<GetFacturesParCampagneQuery>({ query: GET_FACTURES_PAR_CAMPAGNE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.facturesParCampagne;
  }

  async getFacture(factureId: string): Promise<GetFactureQuery['facture']> {
    const result = await firstValueFrom(
      this.apollo.query<GetFactureQuery>({ query: GET_FACTURE,
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
  async getAvoirAbonne(abonneId: string): Promise<GetAvoirAbonneQuery['avoirAbonne']> {
    const result = await firstValueFrom(
      this.apollo.query<GetAvoirAbonneQuery>({ query: GET_AVOIR_ABONNE,
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
  async annulerFacture(factureId: string, motif: string): Promise<AnnulerFactureMutation['annulerFacture']> {
    const result = await firstValueFrom(
      this.apollo.mutate<AnnulerFactureMutation>({ mutation: ANNULER_FACTURE,
        variables: { factureId, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.annulerFacture;
  }

  /**
   * Annule un paiement saisi par erreur — le solde de la facture est rétabli.
   *
   * Annulation douce : le paiement reste en base, marqué annulé avec qui, quand
   * et pourquoi. C'est la règle comptable, pas une limite technique — on ne
   * retouche pas une écriture enregistrée, on la contre-passe.
   *
   * Il n'existe donc **pas** de `modifierPaiement`, et il ne doit pas en
   * exister : corriger un montant se fait en annulant puis en ressaisissant.
   *
   * Le backend refuse une seconde annulation du même paiement — inutile de
   * s'en prémunir ici, l'erreur remonte avec son message.
   */
  async annulerPaiement(paiementId: string, motif: string): Promise<AnnulerPaiementMutation['annulerPaiement']> {
    const result = await firstValueFrom(
      this.apollo.mutate<AnnulerPaiementMutation>({ mutation: ANNULER_PAIEMENT,
        variables: { paiementId, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.annulerPaiement;
  }

  /**
   * Émet un avoir manuel sur le compte d'un abonné (note de rectification).
   *
   * Pour une facture corrigée à la baisse, une erreur d'index constatée après
   * paiement, ou un geste commercial. L'avoir s'impute automatiquement sur les
   * prochaines factures de l'abonné.
   *
   * À ne pas confondre avec le trop-perçu, qui alimente le même avoir sans
   * aucun geste : verser plus que le solde restant suffit.
   */
  async crediterAvoir(abonneId: string, montant: number, motif: string): Promise<CrediterAvoirMutation['crediterAvoir']> {
    const result = await firstValueFrom(
      this.apollo.mutate<CrediterAvoirMutation>({ mutation: CREDITER_AVOIR,
        variables: { abonneId, montant, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.crediterAvoir;
  }

  /**
   * Annule une facture et en émet une corrigée depuis le relevé actuel.
   *
   * Le relevé est relu côté serveur, jamais recopié : c'est ce qui permet à une
   * correction d'index de produire la facture juste plutôt que de reproduire
   * l'erreur. L'abonné retrouve son versement sans que personne ne le
   * ressaisisse — il passe par l'avoir et revient sur la nouvelle facture.
   */
  async regenererFacture(factureId: string, motif: string): Promise<RegenererFactureMutation['regenererFacture']> {
    const result = await firstValueFrom(
      this.apollo.mutate<RegenererFactureMutation>({ mutation: REGENERER_FACTURE,
        variables: { factureId, motif },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.regenererFacture;
  }

  async getSoldeFacture(factureId: string): Promise<GetSoldeFactureQuery['soldeFacture']> {
    const result = await firstValueFrom(
      this.apollo.query<GetSoldeFactureQuery>({ query: GET_SOLDE_FACTURE,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.soldeFacture;
  }

  async getPaiements(factureId: string): Promise<GetPaiementsQuery['paiements']> {
    const result = await firstValueFrom(
      this.apollo.query<GetPaiementsQuery>({ query: GET_PAIEMENTS,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.paiements;
  }

  async getEnvois(factureId: string): Promise<GetEnvoisQuery['envois']> {
    const result = await firstValueFrom(
      this.apollo.query<GetEnvoisQuery>({ query: GET_ENVOIS,
        variables: { factureId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.envois;
  }

  /** Historique global des envois WhatsApp (écran Envois) — ADMIN, COMPTABLE. */
  async getAllEnvois(): Promise<GetAllEnvoisQuery['envois']> {
    const result = await firstValueFrom(
      this.apollo.query<GetAllEnvoisQuery>({ query: GET_ALL_ENVOIS,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.envois;
  }

  async genererFactures(campagneId: string, envoyerWhatsappAuto: boolean): Promise<GenererFacturesMutation['genererFactures']> {
    const result = await firstValueFrom(
      this.apollo.mutate<GenererFacturesMutation>({ mutation: GENERER_FACTURES,
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

  async envoyerFactureWhatsapp(factureId: string, abonneId: string): Promise<EnvoyerFactureWhatsappMutation['envoyerFactureWhatsapp']> {
    const result = await firstValueFrom(
      this.apollo.mutate<EnvoyerFactureWhatsappMutation>({ mutation: ENVOYER_FACTURE_WHATSAPP,
        variables: { factureId, abonneId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.envoyerFactureWhatsapp;
  }

  async renvoyerFactureWhatsapp(factureId: string): Promise<RenvoyerFactureWhatsappMutation['renvoyerFactureWhatsapp']> {
    const result = await firstValueFrom(
      this.apollo.mutate<RenvoyerFactureWhatsappMutation>({ mutation: RENVOYER_FACTURE_WHATSAPP,
        variables: { factureId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.renvoyerFactureWhatsapp;
  }

  /** Rejoue un envoi précis par son id (variante unitaire de renvoiement). */
  async renvoyerEnvoi(envoiId: string): Promise<RenvoyerEnvoiMutation['renvoyerEnvoi']> {
    const result = await firstValueFrom(
      this.apollo.mutate<RenvoyerEnvoiMutation>({ mutation: RENVOYER_ENVOI,
        variables: { envoiId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.renvoyerEnvoi;
  }

  /**
   * Envoie le reçu d'un versement directement depuis l'écran du versement.
   * Marche toujours, y compris pour un versement dont le reçu — envoyé avant
   * que le journal ne garde le lien vers son versement — ne peut pas être
   * renvoyé depuis le journal WhatsApp (`renvoyerEnvoi`).
   */
  async envoyerRecuPaiement(
    paiementId: string,
    factureId: string,
    abonneId: string,
  ): Promise<EnvoyerRecuPaiementMutation['envoyerRecuPaiement']> {
    const result = await firstValueFrom(
      this.apollo.mutate<EnvoyerRecuPaiementMutation>({ mutation: ENVOYER_RECU_PAIEMENT,
        variables: { paiementId, factureId, abonneId },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.envoyerRecuPaiement;
  }

  async enregistrerPaiement(input: EnregistrerPaiementInput): Promise<EnregistrerPaiementMutation['enregistrerPaiement']> {
    const result = await firstValueFrom(
      this.apollo.mutate<EnregistrerPaiementMutation>({ mutation: ENREGISTRER_PAIEMENT,
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

  async getAllPaiements(): Promise<GetAllPaiementsQuery['paiements']> {
    const result = await firstValueFrom(
      this.apollo.query<GetAllPaiementsQuery>({ query: GET_ALL_PAIEMENTS,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.paiements;
  }

  async getImpayes(): Promise<GetImpayesQuery['impayes']> {
    const result = await firstValueFrom(
      this.apollo.query<GetImpayesQuery>({ query: GET_IMPAYES,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.impayes;
  }

  async getSuiviImpaye(factureId: string): Promise<GetSuiviImpayeQuery['suiviImpaye']> {
    const result = await firstValueFrom(
      this.apollo.query<GetSuiviImpayeQuery>({ query: GET_SUIVI_IMPAYE,
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
  } = {}): Promise<GetFacturesQuery['factures']> {
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
      this.apollo.query<GetFacturesQuery>({ query: GET_FACTURES,
        variables: params,
        fetchPolicy: 'network-only',
      }),
    );
    const data = result.data!.factures;
    this.facturesCache = { key, data, ts: now };
    return data;
  }

  /** Ce qu'un abonné doit encore, hors une facture donnée. */
  async getDetteAbonne(abonneId: string, horsFactureId?: string): Promise<GetDetteAbonneQuery['detteAbonne']> {
    const result = await firstValueFrom(
      this.apollo.query<GetDetteAbonneQuery>({ query: GET_DETTE_ABONNE,
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
  }): Promise<NonNullable<CreerRegularisationMutation['creerRegularisation']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<CreerRegularisationMutation>({ mutation: CREER_REGULARISATION,
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
  }): Promise<NonNullable<EnregistrerPaiementAbonneMutation['enregistrerPaiementAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<EnregistrerPaiementAbonneMutation>({ mutation: ENREGISTRER_PAIEMENT_ABONNE,
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
      this.apollo.query<GetTarifActuelQuery>({ query: GET_TARIF_ACTUEL,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.tarifActuel;
  }

  async updateStatutFacture(factureId: string, statut: StatutFacture): Promise<UpdateStatutFactureMutation['updateStatutFacture']> {
    const result = await firstValueFrom(
      this.apollo.mutate<UpdateStatutFactureMutation>({ mutation: UPDATE_STATUT_FACTURE,
        variables: { factureId, statut },
      }),
    );
    this.invalidateFacturesCache();
    return result.data!.updateStatutFacture;
  }

  async updateTarif(prixM3: number, dateEffet: string): Promise<UpdateTarifMutation['updateTarif']> {
    const result = await firstValueFrom(
      this.apollo.mutate<UpdateTarifMutation>({ mutation: UPDATE_TARIF,
        variables: { prixM3, dateEffet },
      }),
    );
    return result.data!.updateTarif;
  }
}
