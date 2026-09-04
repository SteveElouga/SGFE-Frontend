import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import {
  ABONNE_UPDATED_SUB,
  GET_ABONNE,
  GET_ABONNES,
  GET_ABONNES_ACTIFS,
  GET_ABONNES_COUNT,
  GET_HISTORIQUE_COMPTEUR,
} from '../../graphql/queries/abonnes.queries';
import {
  CREATE_ABONNE,
  REACTIVER_ABONNE,
  REMPLACER_COMPTEUR,
  RESILIER_ABONNE,
  SUSPENDRE_ABONNE,
  UPDATE_ABONNE,
  UPDATE_COMPTEUR,
} from '../../graphql/mutations/abonnes.mutations';
import { AbonnesService } from './abonnes.service';

describe('AbonnesService', () => {
  function setup() {
    const querySpy = vi.fn();
    const mutateSpy = vi.fn();
    const watchQuerySpy = vi.fn();
    const subscribeSpy = vi.fn();
    const readQuerySpy = vi.fn();
    const writeQuerySpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Apollo,
          useValue: {
            query: querySpy,
            mutate: mutateSpy,
            watchQuery: watchQuerySpy,
            subscribe: subscribeSpy,
            client: { cache: { readQuery: readQuerySpy, writeQuery: writeQuerySpy } },
          },
        },
      ],
    });

    return {
      service: TestBed.inject(AbonnesService),
      querySpy, mutateSpy, watchQuerySpy, subscribeSpy, readQuerySpy, writeQuerySpy,
    };
  }

  // ── startCacheSync ─────────────────────────────────────────────────────────

  describe('startCacheSync', () => {
    function declencher(subscribeSpy: ReturnType<typeof vi.fn>, payload: unknown) {
      subscribeSpy.mockReturnValue(of({ data: payload }));
    }

    it('souscrit en silentError, jamais de toast global sur cette synchro de fond', () => {
      const { service, subscribeSpy } = setup();
      subscribeSpy.mockReturnValue(of({ data: null }));
      service.startCacheSync();
      expect(subscribeSpy).toHaveBeenCalledWith({
        query: ABONNE_UPDATED_SUB,
        context: { silentError: true },
      });
    });

    it('ignore un événement sans charge utile', () => {
      const { service, subscribeSpy, readQuerySpy } = setup();
      declencher(subscribeSpy, null);
      service.startCacheSync();
      expect(readQuerySpy).not.toHaveBeenCalled();
    });

    it('n’écrit rien si la liste GET_ABONNES_ACTIFS n’est pas en cache', () => {
      const { service, subscribeSpy, readQuerySpy, writeQuerySpy } = setup();
      readQuerySpy.mockReturnValue(null);
      declencher(subscribeSpy, { abonneUpdated: { id: 'a1', statut: 'ACTIF', compteur: null } });
      service.startCacheSync();
      expect(readQuerySpy).toHaveBeenCalledWith({ query: GET_ABONNES_ACTIFS });
      expect(writeQuerySpy).not.toHaveBeenCalled();
    });

    it('ajoute un abonné qui redevient ACTIF et n’était pas dans la liste', () => {
      const { service, subscribeSpy, readQuerySpy, writeQuerySpy } = setup();
      readQuerySpy.mockReturnValue({ abonnesActifs: [{ id: 'existant', compteur: null }] });
      declencher(subscribeSpy, {
        abonneUpdated: { id: 'nouveau', statut: 'ACTIF', compteur: { quartier: 'Bastos', camp: 3 } },
      });

      service.startCacheSync();

      expect(writeQuerySpy).toHaveBeenCalledWith({
        query: GET_ABONNES_ACTIFS,
        data: {
          abonnesActifs: [
            { id: 'existant', compteur: null },
            { __typename: 'Abonne', id: 'nouveau', compteur: { __typename: 'Compteur', quartier: 'Bastos', camp: 3 } },
          ],
        },
      });
    });

    it('retire un abonné suspendu/résilié qui était présent dans la liste', () => {
      const { service, subscribeSpy, readQuerySpy, writeQuerySpy } = setup();
      readQuerySpy.mockReturnValue({ abonnesActifs: [{ id: 'a1', compteur: null }, { id: 'a2', compteur: null }] });
      declencher(subscribeSpy, { abonneUpdated: { id: 'a1', statut: 'SUSPENDU', compteur: null } });

      service.startCacheSync();

      expect(writeQuerySpy).toHaveBeenCalledWith({
        query: GET_ABONNES_ACTIFS,
        data: { abonnesActifs: [{ id: 'a2', compteur: null }] },
      });
    });

    it('ne touche pas au cache pour un abonné déjà ACTIF et déjà présent', () => {
      const { service, subscribeSpy, readQuerySpy, writeQuerySpy } = setup();
      readQuerySpy.mockReturnValue({ abonnesActifs: [{ id: 'a1', compteur: null }] });
      declencher(subscribeSpy, { abonneUpdated: { id: 'a1', statut: 'ACTIF', compteur: null } });

      service.startCacheSync();

      expect(writeQuerySpy).not.toHaveBeenCalled();
    });

    it('ne touche pas au cache pour un abonné non-ACTIF déjà absent', () => {
      const { service, subscribeSpy, readQuerySpy, writeQuerySpy } = setup();
      readQuerySpy.mockReturnValue({ abonnesActifs: [{ id: 'a2', compteur: null }] });
      declencher(subscribeSpy, { abonneUpdated: { id: 'a1', statut: 'RESILIE', compteur: null } });

      service.startCacheSync();

      expect(writeQuerySpy).not.toHaveBeenCalled();
    });
  });

  // ── Lectures ───────────────────────────────────────────────────────────────

  describe('getAbonnesActifs', () => {
    it('aplati compteur.quartier/camp au premier niveau', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({
        data: { abonnesActifs: [{ id: 'a1', compteur: { quartier: 'Bastos', camp: 3 } }, { id: 'a2', compteur: null }] },
      }));

      const res = await service.getAbonnesActifs();

      expect(querySpy).toHaveBeenCalledWith({ query: GET_ABONNES_ACTIFS, fetchPolicy: 'network-only' });
      expect(res).toEqual([
        { id: 'a1', quartier: 'Bastos', camp: 3 },
        { id: 'a2', quartier: null, camp: null },
      ]);
    });

    it('rend une liste vide quand la réponse est vide', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: null }));
      expect(await service.getAbonnesActifs()).toEqual([]);
    });
  });

  describe('watchAbonnes', () => {
    it('transmet les paramètres de pagination', () => {
      const { service, watchQuerySpy } = setup();
      const sentinel = {};
      watchQuerySpy.mockReturnValue(sentinel);

      const res = service.watchAbonnes({ statut: 'ACTIF', limit: 20, offset: 40 });

      expect(watchQuerySpy).toHaveBeenCalledWith({
        query: GET_ABONNES,
        variables: { statut: 'ACTIF', limit: 20, offset: 40 },
      });
      expect(res).toBe(sentinel);
    });

    it('sans paramètres, transmet un objet vide (liste complète historique)', () => {
      const { service, watchQuerySpy } = setup();
      service.watchAbonnes();
      expect(watchQuerySpy).toHaveBeenCalledWith({ query: GET_ABONNES, variables: {} });
    });
  });

  describe('getAbonnesCount', () => {
    it('rend le total pour un statut donné', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: { abonnesCount: 42 } }));
      const res = await service.getAbonnesCount('ACTIF');
      expect(querySpy).toHaveBeenCalledWith({
        query: GET_ABONNES_COUNT, variables: { statut: 'ACTIF' }, fetchPolicy: 'network-only',
      });
      expect(res).toBe(42);
    });

    it('rend 0 quand la réponse est vide', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: null }));
      expect(await service.getAbonnesCount()).toBe(0);
    });
  });

  describe('getAbonne', () => {
    it('rend l’abonné trouvé', async () => {
      const { service, querySpy } = setup();
      const abonne = { id: 'a1', nom: 'Dupont' };
      querySpy.mockReturnValue(of({ data: { abonne } }));
      const res = await service.getAbonne('a1');
      expect(querySpy).toHaveBeenCalledWith({ query: GET_ABONNE, variables: { id: 'a1' } });
      expect(res).toBe(abonne);
    });

    it('lève une erreur explicite quand l’abonné est introuvable', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: { abonne: null } }));
      await expect(service.getAbonne('inconnu')).rejects.toThrow('Abonné introuvable');
    });

    it('propage une erreur GraphQL', async () => {
      const { service, querySpy } = setup();
      const err = new CombinedGraphQLErrors({ errors: [{ message: 'PERMISSION_DENIED' }] } as never);
      querySpy.mockReturnValue(throwError(() => err));
      await expect(service.getAbonne('a1')).rejects.toBe(err);
    });
  });

  describe('getHistoriqueCompteur', () => {
    it('rend l’historique pour l’abonné', async () => {
      const { service, querySpy } = setup();
      const historique = [{ numeroCompteur: 1 }];
      querySpy.mockReturnValue(of({ data: { historiqueCompteur: historique } }));
      const res = await service.getHistoriqueCompteur('a1');
      expect(querySpy).toHaveBeenCalledWith({ query: GET_HISTORIQUE_COMPTEUR, variables: { id: 'a1' } });
      expect(res).toBe(historique);
    });

    it('rend une liste vide quand la réponse est vide', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: null }));
      expect(await service.getHistoriqueCompteur('a1')).toEqual([]);
    });
  });

  // ── Écritures ──────────────────────────────────────────────────────────────

  describe('createAbonne', () => {
    it('crée l’abonné et rafraîchit les deux listes', async () => {
      const { service, mutateSpy } = setup();
      const created = { id: 'a1', nom: 'Dupont' };
      mutateSpy.mockReturnValue(of({ data: { createAbonne: created } }));

      const input = {
        nom: 'Dupont', prenom: 'Jean', telephoneWhatsapp: '+237612345678', numeroCompteur: 1,
        quartier: 'Bastos', camp: 1, indexInitial: 0, datePose: '2026-01-01',
      };
      const res = await service.createAbonne(input);

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: CREATE_ABONNE,
        variables: { input },
        refetchQueries: [{ query: GET_ABONNES }, { query: GET_ABONNES_ACTIFS }],
        awaitRefetchQueries: true,
      });
      expect(res).toBe(created);
    });

    it('lève une erreur explicite si le serveur ne renvoie rien', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.createAbonne({} as never)).rejects.toThrow('Réponse invalide du serveur');
    });

    it('propage une erreur GraphQL (ex. numéro de compteur déjà utilisé)', async () => {
      const { service, mutateSpy } = setup();
      const err = new CombinedGraphQLErrors({ errors: [{ message: 'ALREADY_EXISTS' }] } as never);
      mutateSpy.mockReturnValue(throwError(() => err));
      await expect(service.createAbonne({} as never)).rejects.toBe(err);
    });
  });

  describe('updateAbonne', () => {
    it('met à jour et rend l’abonné', async () => {
      const { service, mutateSpy } = setup();
      const updated = { id: 'a1', nom: 'Nouveau' };
      mutateSpy.mockReturnValue(of({ data: { updateAbonne: updated } }));
      const res = await service.updateAbonne('a1', { nom: 'Nouveau' });
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: UPDATE_ABONNE, variables: { id: 'a1', input: { nom: 'Nouveau' } } });
      expect(res).toBe(updated);
    });

    it('lève une erreur explicite si la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.updateAbonne('a1', {})).rejects.toThrow('Réponse invalide du serveur');
    });
  });

  describe('suspendreAbonne / reactiverAbonne / resilierAbonne', () => {
    it('suspendreAbonne rend l’abonné suspendu', async () => {
      const { service, mutateSpy } = setup();
      const abonne = { id: 'a1', statut: 'SUSPENDU' };
      mutateSpy.mockReturnValue(of({ data: { suspendreAbonne: abonne } }));
      const res = await service.suspendreAbonne('a1');
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: SUSPENDRE_ABONNE, variables: { id: 'a1' } });
      expect(res).toBe(abonne);
    });

    it('suspendreAbonne lève une erreur si la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.suspendreAbonne('a1')).rejects.toThrow('Réponse invalide du serveur');
    });

    it('reactiverAbonne rend l’abonné réactivé', async () => {
      const { service, mutateSpy } = setup();
      const abonne = { id: 'a1', statut: 'ACTIF' };
      mutateSpy.mockReturnValue(of({ data: { reactiverAbonne: abonne } }));
      const res = await service.reactiverAbonne('a1');
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: REACTIVER_ABONNE, variables: { id: 'a1' } });
      expect(res).toBe(abonne);
    });

    it('resilierAbonne rend l’abonné résilié', async () => {
      const { service, mutateSpy } = setup();
      const abonne = { id: 'a1', statut: 'RESILIE' };
      mutateSpy.mockReturnValue(of({ data: { resilierAbonne: abonne } }));
      const res = await service.resilierAbonne('a1');
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: RESILIER_ABONNE, variables: { id: 'a1' } });
      expect(res).toBe(abonne);
    });

    it('resilierAbonne lève une erreur si la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.resilierAbonne('a1')).rejects.toThrow('Réponse invalide du serveur');
    });
  });

  describe('updateCompteur / remplacerCompteur', () => {
    it('updateCompteur rend le compteur mis à jour', async () => {
      const { service, mutateSpy } = setup();
      const compteur = { numeroCompteur: 1, quartier: 'Bastos' };
      mutateSpy.mockReturnValue(of({ data: { updateCompteur: compteur } }));
      const res = await service.updateCompteur('a1', { quartier: 'Bastos' });
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: UPDATE_COMPTEUR, variables: { abonneId: 'a1', input: { quartier: 'Bastos' } } });
      expect(res).toBe(compteur);
    });

    it('updateCompteur lève une erreur si la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.updateCompteur('a1', {})).rejects.toThrow('Réponse invalide du serveur');
    });

    it('remplacerCompteur transmet l’index de fermeture et le nouveau compteur', async () => {
      const { service, mutateSpy } = setup();
      const compteur = { numeroCompteur: 2, quartier: 'Essos' };
      mutateSpy.mockReturnValue(of({ data: { remplacerCompteur: compteur } }));
      const input = {
        indexFermeture: 1200, nouveauNumeroCompteur: 2, nouveauQuartier: 'Essos',
        nouveauCamp: 1, nouvelIndexInitial: 0, dateRemplacement: '2026-08-01',
      };
      const res = await service.remplacerCompteur('a1', input);
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: REMPLACER_COMPTEUR, variables: { abonneId: 'a1', input } });
      expect(res).toBe(compteur);
    });

    it('remplacerCompteur lève une erreur si la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(
        service.remplacerCompteur('a1', {
          indexFermeture: 0, nouveauNumeroCompteur: 1, nouveauQuartier: 'x',
          nouveauCamp: 1, nouvelIndexInitial: 0, dateRemplacement: '2026-01-01',
        }),
      ).rejects.toThrow('Réponse invalide du serveur');
    });
  });
});
