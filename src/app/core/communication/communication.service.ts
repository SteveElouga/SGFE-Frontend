import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo, QueryRef } from 'apollo-angular';
import { CREER_DIFFUSION } from '../../graphql/mutations/communication.mutations';
import { GET_DIFFUSION, GET_DIFFUSIONS } from '../../graphql/queries/communication.queries';
import type {
  CreerDiffusionMutation,
  GetDiffusionQuery,
  GetDiffusionsQuery,
} from '../../graphql/generated';

/**
 * Accès GraphQL au domaine « communication » : diffusion d'un message libre à
 * un ensemble d'abonnés. Le ciblage (filtres quartier/camp/statut ou
 * sélection manuelle) est résolu par l'écran appelant — ce service ne reçoit
 * que la liste finale d'`abonneId`, il ne connaît rien du filtrage.
 *
 * L'envoi lui-même a lieu en fond côté serveur (voir la progression via
 * `watchDiffusion` + la subscription `diffusionProgressionUpdated`) : la
 * mutation `creerDiffusion` rend dès que la diffusion et ses lignes sont
 * créées, pas quand tous les messages sont partis.
 */
@Injectable({ providedIn: 'root' })
export class CommunicationService {
  private readonly apollo = inject(Apollo);

  async creerDiffusion(message: string, abonneIds: string[]): Promise<CreerDiffusionMutation['creerDiffusion']> {
    const result = await firstValueFrom(
      this.apollo.mutate<CreerDiffusionMutation>({
        mutation: CREER_DIFFUSION,
        variables: { message, abonneIds },
      }),
    );
    return result.data!.creerDiffusion;
  }

  watchDiffusions(): QueryRef<GetDiffusionsQuery> {
    return this.apollo.watchQuery<GetDiffusionsQuery>({
      query: GET_DIFFUSIONS,
      fetchPolicy: 'cache-and-network',
    });
  }

  async getDiffusion(diffusionId: string): Promise<GetDiffusionQuery['diffusion']> {
    const result = await firstValueFrom(
      this.apollo.query<GetDiffusionQuery>({
        query: GET_DIFFUSION,
        variables: { diffusionId },
        // La progression bouge pendant qu'on regarde — jamais de cache seul.
        fetchPolicy: 'network-only',
      }),
    );
    return result.data!.diffusion;
  }
}
