import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  GET_FACTURES_PAR_CAMPAGNE,
  GET_FACTURES,
  GET_FACTURE,
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
} from '../../graphql/mutations/factures.mutations';
import {
  Envoi,
  EnregistrerPaiementInput,
  Facture,
  Paiement,
  SoldeFacture,
  StatutFacture,
  SuiviImpaye,
  Tarif,
} from '../../shared/models/facture.model';

/**
 * Accès GraphQL au domaine facturation & encaissement : factures (par campagne,
 * détail, statut), soldes et impayés, paiements, envois WhatsApp, génération des
 * factures et tarif courant. Singleton (`providedIn: 'root'`).
 */
@Injectable({ providedIn: 'root' })
export class FacturesService {
  private readonly apollo = inject(Apollo);

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
    return result.data!.genererFactures;
  }

  async envoyerToutesFacturesWhatsapp(campagneId: string): Promise<void> {
    await firstValueFrom(
      this.apollo.mutate({
        mutation: ENVOYER_TOUTES_FACTURES_WHATSAPP,
        variables: { campagneId },
      }),
    );
  }

  async envoyerFactureWhatsapp(factureId: string, abonneId: string): Promise<Envoi> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ envoyerFactureWhatsapp: Envoi }>({
        mutation: ENVOYER_FACTURE_WHATSAPP,
        variables: { factureId, abonneId },
      }),
    );
    return result.data!.envoyerFactureWhatsapp;
  }

  async renvoyerFactureWhatsapp(factureId: string): Promise<Envoi> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ renvoyerFactureWhatsapp: Envoi }>({
        mutation: RENVOYER_FACTURE_WHATSAPP,
        variables: { factureId },
      }),
    );
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
        fetchPolicy: 'cache-first',
      }),
    );
    return result.data!.suiviImpaye;
  }

  async getFactures(params: {
    campagneId?: string;
    abonneId?: string;
    statut?: string;
  } = {}): Promise<Facture[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ factures: Facture[] }>({
        query: GET_FACTURES,
        variables: params,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.factures;
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
