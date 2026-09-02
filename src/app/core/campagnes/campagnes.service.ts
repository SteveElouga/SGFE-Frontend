import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo, QueryRef } from 'apollo-angular';
import { CorrigerReleveInput, CreateCampagneInput, MarquerNonReleveInput, SaisirIndexInput, ZoneInput } from '../../shared/models/campagne.model';
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
import type { AffecterAgentMutation, AffecterZonesMutation, AjouterAbonnesCampagneMutation, CloturerCampagneMutation, CorrigerReleveMutation, CreerCampagneMutation, DemarrerCampagneMutation, GetAgentsCampagneQuery, GetAgentsDisponiblesQuery, GetCampagneQuery, GetCampagnesQuery, GetDernierIndexQuery, GetProgressionQuery, GetRelevesParAgentQuery, GetRelevesQuery, GetRepartitionZoneQuery, GetZonesDisponiblesQuery, MarquerNonReleveMutation, ResumeClotureQuery, SaisirIndexMutation } from '../../graphql/generated';

/**
 * Accès GraphQL au domaine « campagnes de relevé » : cycle de vie des campagnes,
 * relevés/index, progression et clôture, agents affectés et répartition par
 * zone. Les listes utilisent `watchQuery` (cache-and-network) ; les écritures
 * passent par des mutations one-shot. Singleton (`providedIn: 'root'`).
 */
@Injectable({ providedIn: 'root' })
export class CampagnesService {
  private readonly apollo = inject(Apollo);

  watchCampagnes(): QueryRef<GetCampagnesQuery> {
    return this.apollo.watchQuery<GetCampagnesQuery>({ query: GET_CAMPAGNES,
      fetchPolicy: 'cache-and-network',
    });
  }

  watchCampagne(campagneId: string): QueryRef<GetCampagneQuery> {
    return this.apollo.watchQuery<GetCampagneQuery>({ query: GET_CAMPAGNE,
      variables: { campagneId },
    });
  }

  /** Lecture ponctuelle de toutes les campagnes (désambiguïsation des homonymes). */
  async getCampagnes(): Promise<GetCampagnesQuery['campagnes']> {
    const result = await firstValueFrom(
      this.apollo.query<GetCampagnesQuery>({ query: GET_CAMPAGNES }),
    );
    return result.data!.campagnes;
  }

  async getCampagne(campagneId: string): Promise<GetCampagneQuery['campagne']> {
    const result = await firstValueFrom(
      this.apollo.query<GetCampagneQuery>({ query: GET_CAMPAGNE,
        variables: { campagneId },
        // Statut, progression et affectations bougent pendant qu'on regarde.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.campagne;
  }

  async getReleves(campagneId: string): Promise<GetRelevesQuery['releves']> {
    const result = await firstValueFrom(
      this.apollo.query<GetRelevesQuery>({ query: GET_RELEVES,
        variables: { campagneId },
      }),
    );
    return result.data!.releves;
  }

  async getProgression(campagneId: string): Promise<GetProgressionQuery['progression']> {
    const result = await firstValueFrom(
      this.apollo.query<GetProgressionQuery>({ query: GET_PROGRESSION,
        variables: { campagneId },
      }),
    );
    return result.data!.progression;
  }

  /** Ventilation autoritative pour la clôture (ADMIN + SUPERVISEUR uniquement). */
  async getResumeCloture(campagneId: string): Promise<ResumeClotureQuery['resumeCloture']> {
    const result = await firstValueFrom(
      this.apollo.query<ResumeClotureQuery>({ query: GET_RESUME_CLOTURE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.resumeCloture;
  }

  async getDernierIndex(abonneId: string): Promise<GetDernierIndexQuery['dernierIndex']> {
    const result = await firstValueFrom(
      this.apollo.query<GetDernierIndexQuery>({ query: GET_DERNIER_INDEX,
        variables: { abonneId },
      }),
    );
    return result.data!.dernierIndex;
  }

  async creerCampagne(input: CreateCampagneInput): Promise<CreerCampagneMutation['creerCampagne']> {
    // Pas de refetch ici : la liste (watchCampagnes) est en cache-and-network,
    // elle refait la requête à chaque montage → fraîche après navigation.
    const result = await firstValueFrom(
      this.apollo.mutate<CreerCampagneMutation>({ mutation: CREER_CAMPAGNE,
        variables: { input },
      }),
    );
    return result.data!.creerCampagne;
  }

  async affecterAgent(campagneId: string, agentId: string): Promise<AffecterAgentMutation['affecterAgent']> {
    const result = await firstValueFrom(
      this.apollo.mutate<AffecterAgentMutation>({ mutation: AFFECTER_AGENT,
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
  ): Promise<AjouterAbonnesCampagneMutation['ajouterAbonnesCampagne']> {
    const result = await firstValueFrom(
      this.apollo.mutate<AjouterAbonnesCampagneMutation>({ mutation: AJOUTER_ABONNES_CAMPAGNE,
        variables: { campagneId, abonneIds },
      }),
    );
    return result.data!.ajouterAbonnesCampagne;
  }

  async cloturerCampagne(campagneId: string): Promise<void> {
    await firstValueFrom(
      this.apollo.mutate<CloturerCampagneMutation>({ mutation: CLOTURER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
  }

  /** Démarre à la demande une campagne PLANIFIEE (→ EN_COURS). */
  async demarrerCampagne(campagneId: string): Promise<DemarrerCampagneMutation['demarrerCampagne']> {
    const result = await firstValueFrom(
      this.apollo.mutate<DemarrerCampagneMutation>({ mutation: DEMARRER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
    return result.data!.demarrerCampagne;
  }

  async saisirIndex(input: SaisirIndexInput): Promise<SaisirIndexMutation['saisirIndex']> {
    const result = await firstValueFrom(
      this.apollo.mutate<SaisirIndexMutation>({ mutation: SAISIR_INDEX,
        variables: { input },
      }),
    );
    return result.data!.saisirIndex;
  }

  async marquerNonReleve(input: MarquerNonReleveInput): Promise<MarquerNonReleveMutation['marquerNonReleve']> {
    const result = await firstValueFrom(
      this.apollo.mutate<MarquerNonReleveMutation>({ mutation: MARQUER_NON_RELEVE,
        variables: { input },
      }),
    );
    return result.data!.marquerNonReleve;
  }

  /** Corrige un index déjà RELEVE (ADMIN / SUPERVISEUR propriétaire). */
  async corrigerReleve(input: CorrigerReleveInput): Promise<CorrigerReleveMutation['corrigerReleve']> {
    const result = await firstValueFrom(
      this.apollo.mutate<CorrigerReleveMutation>({ mutation: CORRIGER_RELEVE,
        variables: { input },
      }),
    );
    return result.data!.corrigerReleve;
  }

  /** Agents affectés à une campagne (statut de tournée, zones, relevés). */
  async getAgentsCampagne(campagneId: string): Promise<GetAgentsCampagneQuery['agentsCampagne']> {
    const result = await firstValueFrom(
      this.apollo.query<GetAgentsCampagneQuery>({ query: GET_AGENTS_CAMPAGNE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.agentsCampagne;
  }

  /** Répartition par zone d'une campagne (zone → agent → abonnés/relevés/%). */
  async getRepartitionZone(campagneId: string): Promise<GetRepartitionZoneQuery['repartitionParZone']> {
    const result = await firstValueFrom(
      this.apollo.query<GetRepartitionZoneQuery>({ query: GET_REPARTITION_ZONE,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.repartitionParZone;
  }

  /** Relevés d'un agent dans une campagne (écran « Voir la tournée »). */
  async getRelevesParAgent(campagneId: string, agentId: string): Promise<GetRelevesParAgentQuery['relevesParAgent']> {
    const result = await firstValueFrom(
      this.apollo.query<GetRelevesParAgentQuery>({ query: GET_RELEVES_PAR_AGENT,
        variables: { campagneId, agentId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.relevesParAgent;
  }

  /** Agents AGENT actifs affectables (ADMIN + SUPERVISEUR). */
  async getAgentsDisponibles(): Promise<GetAgentsDisponiblesQuery['agentsDisponibles']> {
    const result = await firstValueFrom(
      this.apollo.query<GetAgentsDisponiblesQuery>({ query: GET_AGENTS_DISPONIBLES,
        // « Disponible » est un état, pas une propriété : il change sans nous.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.agentsDisponibles;
  }

  /** Zones (quartier + camp) et nombre d'abonnés actifs par zone. */
  async getZonesDisponibles(): Promise<GetZonesDisponiblesQuery['zonesDisponibles']> {
    const result = await firstValueFrom(
      this.apollo.query<GetZonesDisponiblesQuery>({ query: GET_ZONES_DISPONIBLES,
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
  ): Promise<AffecterZonesMutation['affecterZones']> {
    const result = await firstValueFrom(
      this.apollo.mutate<AffecterZonesMutation>({ mutation: AFFECTER_ZONES,
        variables: { campagneId, agentId, zones },
      }),
    );
    return result.data!.affecterZones;
  }
}
