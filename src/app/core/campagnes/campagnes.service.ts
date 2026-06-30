import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
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
      }),
    );
    return result.data!.campagne;
  }

  async getReleves(campagneId: string): Promise<Releve[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ releves: Releve[] }>({
        query: GET_RELEVES,
        variables: { campagneId },
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.releves;
  }

  async getProgression(campagneId: string): Promise<Progression> {
    const result = await firstValueFrom(
      this.apollo.query<{ progression: Progression }>({
        query: GET_PROGRESSION,
        variables: { campagneId },
        fetchPolicy: 'network-only',
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
    const result = await firstValueFrom(
      this.apollo.mutate<{ creerCampagne: Campagne }>({
        mutation: CREER_CAMPAGNE,
        variables: { input },
      }),
    );
    const created = result.data!.creerCampagne;
    // Ajouter au cache list
    const cached = this.apollo.client.readQuery<{ campagnes: Campagne[] }>({ query: GET_CAMPAGNES });
    if (cached) {
      this.apollo.client.writeQuery({
        query: GET_CAMPAGNES,
        data: { campagnes: [created, ...cached.campagnes] },
      });
    }
    return created;
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

  async cloturerCampagne(campagneId: string): Promise<Campagne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ cloturerCampagne: Campagne }>({
        mutation: CLOTURER_CAMPAGNE,
        variables: { campagneId },
      }),
    );
    const updated = result.data!.cloturerCampagne;
    // Patch le statut dans le cache list
    const cached = this.apollo.client.readQuery<{ campagnes: Campagne[] }>({ query: GET_CAMPAGNES });
    if (cached) {
      this.apollo.client.writeQuery({
        query: GET_CAMPAGNES,
        data: {
          campagnes: cached.campagnes.map((c) =>
            c.campagneId === updated.campagneId ? { ...c, ...updated } : c,
          ),
        },
      });
    }
    return updated;
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
