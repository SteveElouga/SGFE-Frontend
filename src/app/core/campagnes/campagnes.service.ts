import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo, QueryRef } from 'apollo-angular';
import {
  AgentAffecte,
  AgentDisponible,
  AjouterAbonnesResult,
  Campagne,
  CorrigerReleveInput,
  CreateCampagneInput,
  DernierIndex,
  MarquerNonReleveInput,
  Progression,
  Releve,
  ResumeCloture,
  SaisirIndexInput,
  ZoneDisponible,
  ZoneInput,
  ZoneRepartition,
} from '../../shared/models/campagne.model';
import {
  GET_AGENTS_CAMPAGNE,
  GET_AGENTS_DISPONIBLES,
  GET_CAMPAGNE,
  GET_CAMPAGNES,
  GET_DERNIER_INDEX,
  GET_PROGRESSION,
  GET_RELEVES,
  GET_RELEVES_PAR_AGENT,
  GET_REPARTITION_ZONE,
  GET_RESUME_CLOTURE,
  GET_ZONES_DISPONIBLES,
} from '../../graphql/queries/campagnes.queries';
import {
  AFFECTER_AGENT,
  AFFECTER_ZONES,
  AJOUTER_ABONNES_CAMPAGNE,
  CLOTURER_CAMPAGNE,
  CORRIGER_RELEVE,
  CREER_CAMPAGNE,
  DEMARRER_CAMPAGNE,
  MARQUER_NON_RELEVE,
  SAISIR_INDEX,
} from '../../graphql/mutations/campagnes.mutations';

/**
 * Accès GraphQL au domaine « campagnes de relevé » : cycle de vie des campagnes,
 * relevés/index, progression et clôture, agents affectés et répartition par
 * zone. Les listes utilisent `watchQuery` (cache-and-network) ; les écritures
 * passent par des mutations one-shot. Singleton (`providedIn: 'root'`).
 */
@Injectable({ providedIn: 'root' })
export class CampagnesService {
  private readonly apollo = inject(Apollo);

  watchCampagnes(): QueryRef<{ campagnes: Campagne[] }> {
    return this.apollo.watchQuery<{ campagnes: Campagne[] }>({
      query: GET_CAMPAGNES,
      fetchPolicy: 'cache-and-network',
    });
  }

  watchCampagne(campagneId: string): QueryRef<{ campagne: Campagne }> {
    return this.apollo.watchQuery<{ campagne: Campagne }>({
      query: GET_CAMPAGNE,
      variables: { campagneId },
    });
  }

  /** Lecture ponctuelle de toutes les campagnes (désambiguïsation des homonymes). */
  async getCampagnes(): Promise<Campagne[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ campagnes: Campagne[] }>({ query: GET_CAMPAGNES }),
    );
    return result.data!.campagnes;
  }

  async getCampagne(campagneId: string): Promise<Campagne> {
    const result = await firstValueFrom(
      this.apollo.query<{ campagne: Campagne }>({
        query: GET_CAMPAGNE,
        variables: { campagneId },
        // Statut, progression et affectations bougent pendant qu'on regarde.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.campagne;
  }

  async getReleves(campagneId: string): Promise<Releve[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ releves: Releve[] }>({
        query: GET_RELEVES,
        variables: { campagneId },
      }),
    );
    return result.data!.releves;
  }

  async getProgression(campagneId: string): Promise<Progression> {
    const result = await firstValueFrom(
      this.apollo.query<{ progression: Progression }>({
        query: GET_PROGRESSION,
        variables: { campagneId },
      }),
    );
    return result.data!.progression;
  }

  /** Ventilation autoritative pour la clôture (ADMIN + SUPERVISEUR uniquement). */
  async getResumeCloture(campagneId: string): Promise<ResumeCloture> {
    const result = await firstValueFrom(
      this.apollo.query<{ resumeCloture: ResumeCloture }>({
        query: GET_RESUME_CLOTURE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.resumeCloture;
  }

  async getDernierIndex(abonneId: string): Promise<DernierIndex> {
    const result = await firstValueFrom(
      this.apollo.query<{ dernierIndex: DernierIndex }>({
        query: GET_DERNIER_INDEX,
        variables: { abonneId },
      }),
    );
    return result.data!.dernierIndex;
  }

  async creerCampagne(input: CreateCampagneInput): Promise<Campagne> {
    // Pas de refetch ici : la liste (watchCampagnes) est en cache-and-network,
    // elle refait la requête à chaque montage → fraîche après navigation.
    const result = await firstValueFrom(
      this.apollo.mutate<{ creerCampagne: Campagne }>({
        mutation: CREER_CAMPAGNE,
        variables: { input },
      }),
    );
    return result.data!.creerCampagne;
  }

  async affecterAgent(campagneId: string, agentId: string): Promise<Campagne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ affecterAgent: Campagne }>({
        mutation: AFFECTER_AGENT,
        variables: { campagneId, agentId },
      }),
    );
    return result.data!.affecterAgent;
  }

  /**
   * Rattache des abonnés à une campagne → crée leurs relevés `A_RELEVER`.
   * Idempotent : doublons / abonnés non ACTIF remontent dans `nbIgnores`.
   */
  async ajouterAbonnesCampagne(
    campagneId: string,
    abonneIds: string[],
  ): Promise<AjouterAbonnesResult> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ ajouterAbonnesCampagne: AjouterAbonnesResult }>({
        mutation: AJOUTER_ABONNES_CAMPAGNE,
        variables: { campagneId, abonneIds },
      }),
    );
    return result.data!.ajouterAbonnesCampagne;
  }

  async cloturerCampagne(campagneId: string): Promise<void> {
    await firstValueFrom(
      this.apollo.mutate<{ cloturerCampagne: Campagne }>({
        mutation: CLOTURER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
  }

  /** Démarre à la demande une campagne PLANIFIEE (→ EN_COURS). */
  async demarrerCampagne(campagneId: string): Promise<Campagne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ demarrerCampagne: Campagne }>({
        mutation: DEMARRER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
    return result.data!.demarrerCampagne;
  }

  async saisirIndex(input: SaisirIndexInput): Promise<Releve> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ saisirIndex: Releve }>({
        mutation: SAISIR_INDEX,
        variables: { input },
      }),
    );
    return result.data!.saisirIndex;
  }

  async marquerNonReleve(input: MarquerNonReleveInput): Promise<Releve> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ marquerNonReleve: Releve }>({
        mutation: MARQUER_NON_RELEVE,
        variables: { input },
      }),
    );
    return result.data!.marquerNonReleve;
  }

  // PENDING DEPLOY (PR #68) — ne pas appeler tant que le Gateway n'expose pas
  // corrigerReleve / relevesParAgent (cf. RELEVE_AUDIT_READY côté UI).

  /** Corrige un index déjà RELEVE (ADMIN / SUPERVISEUR propriétaire). */
  async corrigerReleve(input: CorrigerReleveInput): Promise<Releve> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ corrigerReleve: Releve }>({
        mutation: CORRIGER_RELEVE,
        variables: { input },
      }),
    );
    return result.data!.corrigerReleve;
  }

  /** Agents affectés à une campagne (statut de tournée, zones, relevés). */
  async getAgentsCampagne(campagneId: string): Promise<AgentAffecte[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ agentsCampagne: AgentAffecte[] }>({
        query: GET_AGENTS_CAMPAGNE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.agentsCampagne;
  }

  /** Répartition par zone d'une campagne (zone → agent → abonnés/relevés/%). */
  async getRepartitionZone(campagneId: string): Promise<ZoneRepartition[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ repartitionParZone: ZoneRepartition[] }>({
        query: GET_REPARTITION_ZONE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.repartitionParZone;
  }

  /** Relevés d'un agent dans une campagne (écran « Voir la tournée »). */
  async getRelevesParAgent(campagneId: string, agentId: string): Promise<Releve[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ relevesParAgent: Releve[] }>({
        query: GET_RELEVES_PAR_AGENT,
        variables: { campagneId, agentId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.relevesParAgent;
  }

  /** Agents AGENT actifs affectables (ADMIN + SUPERVISEUR). */
  async getAgentsDisponibles(): Promise<AgentDisponible[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ agentsDisponibles: AgentDisponible[] }>({
        query: GET_AGENTS_DISPONIBLES,
        // « Disponible » est un état, pas une propriété : il change sans nous.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.agentsDisponibles;
  }

  /** Zones (quartier + camp) et nombre d'abonnés actifs par zone. */
  async getZonesDisponibles(): Promise<ZoneDisponible[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ zonesDisponibles: ZoneDisponible[] }>({
        query: GET_ZONES_DISPONIBLES,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.zonesDisponibles;
  }

  /** Affecte l'ensemble exact de zones d'un agent (une zone = un seul agent). */
  async affecterZones(
    campagneId: string,
    agentId: string,
    zones: ZoneInput[],
  ): Promise<AgentAffecte[]> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ affecterZones: AgentAffecte[] }>({
        mutation: AFFECTER_ZONES,
        variables: { campagneId, agentId, zones },
      }),
    );
    return result.data!.affecterZones;
  }
}
