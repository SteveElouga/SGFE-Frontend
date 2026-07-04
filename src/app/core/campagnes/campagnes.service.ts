import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo, QueryRef } from 'apollo-angular';
import {
  Campagne,
  CreateCampagneInput,
  DernierIndex,
  MarquerNonReleveInput,
  Progression,
  Releve,
  SaisirIndexInput,
} from '../../shared/models/campagne.model';
import {
  GET_CAMPAGNE,
  GET_CAMPAGNES,
  GET_DERNIER_INDEX,
  GET_PROGRESSION,
  GET_RELEVES,
} from '../../graphql/queries/campagnes.queries';
import {
  AFFECTER_AGENT,
  CLOTURER_CAMPAGNE,
  CREER_CAMPAGNE,
  MARQUER_NON_RELEVE,
  SAISIR_INDEX,
} from '../../graphql/mutations/campagnes.mutations';

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

  async getCampagne(campagneId: string): Promise<Campagne> {
    const result = await firstValueFrom(
      this.apollo.query<{ campagne: Campagne }>({
        query: GET_CAMPAGNE,
        variables: { campagneId },
        fetchPolicy: 'cache-first',
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

  async cloturerCampagne(campagneId: string): Promise<void> {
    await firstValueFrom(
      this.apollo.mutate<{ cloturerCampagne: Campagne }>({
        mutation: CLOTURER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
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
}
