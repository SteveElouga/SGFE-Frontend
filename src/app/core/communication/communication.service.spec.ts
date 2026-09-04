import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { CREER_DIFFUSION } from '../../graphql/mutations/communication.mutations';
import { GET_DIFFUSION, GET_DIFFUSIONS } from '../../graphql/queries/communication.queries';
import { CommunicationService } from './communication.service';

describe('CommunicationService', () => {
  function setup() {
    const mutateSpy = vi.fn();
    const querySpy = vi.fn();
    const watchQuerySpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: Apollo, useValue: { mutate: mutateSpy, query: querySpy, watchQuery: watchQuerySpy } },
      ],
    });
    return { service: TestBed.inject(CommunicationService), mutateSpy, querySpy, watchQuerySpy };
  }

  describe('creerDiffusion', () => {
    it('envoie le message et les destinataires, et rend la diffusion créée', async () => {
      const { service, mutateSpy } = setup();
      const diffusion = { diffusionId: 'd1', message: 'Coupure demain', nbDestinataires: 2 };
      mutateSpy.mockReturnValue(of({ data: { creerDiffusion: diffusion } }));

      const res = await service.creerDiffusion('Coupure demain', ['a1', 'a2']);

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: CREER_DIFFUSION,
        variables: { message: 'Coupure demain', abonneIds: ['a1', 'a2'] },
      });
      expect(res).toBe(diffusion);
    });

    it('propage l’erreur GraphQL telle quelle (pas de message générique masquant)', async () => {
      const { service, mutateSpy } = setup();
      const err = new CombinedGraphQLErrors({ errors: [{ message: 'Aucun destinataire valide' }] } as never);
      mutateSpy.mockReturnValue(throwError(() => err));

      await expect(service.creerDiffusion('x', [])).rejects.toBe(err);
    });
  });

  describe('watchDiffusions', () => {
    it('interroge en cache-and-network', () => {
      const { service, watchQuerySpy } = setup();
      const sentinel = { sentinel: true };
      watchQuerySpy.mockReturnValue(sentinel);

      const res = service.watchDiffusions();

      expect(watchQuerySpy).toHaveBeenCalledWith({ query: GET_DIFFUSIONS, fetchPolicy: 'cache-and-network' });
      expect(res).toBe(sentinel);
    });
  });

  describe('getDiffusion', () => {
    it('interroge en network-only et rend la diffusion demandée', async () => {
      const { service, querySpy } = setup();
      const diffusion = { diffusionId: 'd1', progression: 50 };
      querySpy.mockReturnValue(of({ data: { diffusion } }));

      const res = await service.getDiffusion('d1');

      expect(querySpy).toHaveBeenCalledWith({
        query: GET_DIFFUSION,
        variables: { diffusionId: 'd1' },
        fetchPolicy: 'network-only',
      });
      expect(res).toBe(diffusion);
    });

    it('propage une erreur réseau', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(throwError(() => new Error('Failed to fetch')));
      await expect(service.getDiffusion('d1')).rejects.toThrow('Failed to fetch');
    });
  });
});
