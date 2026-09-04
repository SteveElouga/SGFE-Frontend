import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { GET_CONFIGS, GET_INFOS_SOCIETE } from '../../graphql/queries/configuration.queries';
import {
  REVOQUER_TOKEN_ABONNE,
  REVOQUER_TOUS_TOKENS_ABONNES,
  TESTER_ENVOI_WHATSAPP,
  UPDATE_CONFIG,
  UPDATE_INFOS_SOCIETE,
} from '../../graphql/mutations/configuration.mutations';
import { ConfigurationService } from './configuration.service';

describe('ConfigurationService', () => {
  function setup() {
    const querySpy = vi.fn();
    const mutateSpy = vi.fn();
    const writeQuerySpy = vi.fn();
    const readQuerySpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Apollo,
          useValue: {
            query: querySpy,
            mutate: mutateSpy,
            client: { writeQuery: writeQuerySpy, readQuery: readQuerySpy },
          },
        },
      ],
    });
    return {
      service: TestBed.inject(ConfigurationService),
      querySpy, mutateSpy, writeQuerySpy, readQuerySpy,
    };
  }

  describe('getInfosSociete', () => {
    it('rend les infos société reçues', async () => {
      const { service, querySpy } = setup();
      const infos = { nom: 'AquaBill', adresse: 'Yaoundé' };
      querySpy.mockReturnValue(of({ data: { infosSociete: infos } }));

      const res = await service.getInfosSociete();

      expect(querySpy).toHaveBeenCalledWith({ query: GET_INFOS_SOCIETE });
      expect(res).toBe(infos);
    });

    it('propage une erreur GraphQL', async () => {
      const { service, querySpy } = setup();
      const err = new CombinedGraphQLErrors({ errors: [{ message: 'PERMISSION_DENIED' }] } as never);
      querySpy.mockReturnValue(throwError(() => err));
      await expect(service.getInfosSociete()).rejects.toBe(err);
    });
  });

  describe('getConfigs', () => {
    it('rend la table de configuration', async () => {
      const { service, querySpy } = setup();
      const configs = [{ cle: 'TARIF', valeur: '500' }];
      querySpy.mockReturnValue(of({ data: { configs } }));

      const res = await service.getConfigs();

      expect(querySpy).toHaveBeenCalledWith({ query: GET_CONFIGS });
      expect(res).toBe(configs);
    });

    it('propage une erreur réseau', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(throwError(() => new Error('Failed to fetch')));
      await expect(service.getConfigs()).rejects.toThrow('Failed to fetch');
    });
  });

  describe('updateInfosSociete', () => {
    it('mute puis écrit le résultat dans le cache (InfosSociete n’a pas d’id)', async () => {
      const { service, mutateSpy, writeQuerySpy } = setup();
      const input = { nom: 'AquaBill SA', adresse: 'Douala', telephone: '+237600000000', logoPath: '/logo.png' };
      const updated = { ...input };
      mutateSpy.mockReturnValue(of({ data: { updateInfosSociete: updated } }));

      const res = await service.updateInfosSociete(input);

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: UPDATE_INFOS_SOCIETE,
        variables: { input },
      });
      expect(writeQuerySpy).toHaveBeenCalledWith({ query: GET_INFOS_SOCIETE, data: { infosSociete: updated } });
      expect(res).toBe(updated);
    });
  });

  describe('updateConfig', () => {
    it('patch la liste en cache quand elle y est déjà', async () => {
      const { service, mutateSpy, readQuerySpy, writeQuerySpy } = setup();
      const updated = { cle: 'TARIF', valeur: '600' };
      mutateSpy.mockReturnValue(of({ data: { updateConfig: updated } }));
      readQuerySpy.mockReturnValue({ configs: [{ cle: 'TARIF', valeur: '500' }, { cle: 'AUTRE', valeur: 'x' }] });

      const res = await service.updateConfig('TARIF', '600');

      expect(mutateSpy).toHaveBeenCalledWith({ mutation: UPDATE_CONFIG, variables: { cle: 'TARIF', valeur: '600' } });
      expect(writeQuerySpy).toHaveBeenCalledWith({
        query: GET_CONFIGS,
        data: { configs: [{ cle: 'TARIF', valeur: '600' }, { cle: 'AUTRE', valeur: 'x' }] },
      });
      expect(res).toBe(updated);
    });

    it('ne tente pas d’écrire dans un cache absent', async () => {
      const { service, mutateSpy, readQuerySpy, writeQuerySpy } = setup();
      mutateSpy.mockReturnValue(of({ data: { updateConfig: { cle: 'TARIF', valeur: '600' } } }));
      readQuerySpy.mockReturnValue(null);

      await service.updateConfig('TARIF', '600');

      expect(writeQuerySpy).not.toHaveBeenCalled();
    });
  });

  describe('testerEnvoiWhatsapp', () => {
    it('rend le résultat du test', async () => {
      const { service, mutateSpy } = setup();
      const test = { success: true, message: 'Message envoyé' };
      mutateSpy.mockReturnValue(of({ data: { testerEnvoiWhatsapp: test } }));

      const res = await service.testerEnvoiWhatsapp('+237612345678');

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: TESTER_ENVOI_WHATSAPP,
        variables: { phoneNumber: '+237612345678' },
      });
      expect(res).toBe(test);
    });

    it('un échec de livraison n’est pas une erreur — success:false remonte tel quel', async () => {
      const { service, mutateSpy } = setup();
      const test = { success: false, message: 'Numéro injoignable' };
      mutateSpy.mockReturnValue(of({ data: { testerEnvoiWhatsapp: test } }));

      const res = await service.testerEnvoiWhatsapp('+237600000000');
      expect(res).toEqual(test);
    });

    it('lève une erreur explicite quand la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(service.testerEnvoiWhatsapp('')).rejects.toThrow('Réponse invalide du serveur');
    });

    it('un numéro vide (INVALID_ARGUMENT) est une vraie erreur GraphQL', async () => {
      const { service, mutateSpy } = setup();
      const err = new CombinedGraphQLErrors({ errors: [{ message: 'Numéro invalide' }] } as never);
      mutateSpy.mockReturnValue(throwError(() => err));
      await expect(service.testerEnvoiWhatsapp('')).rejects.toBe(err);
    });
  });

  describe('revoquerTousTokensAbonnes', () => {
    it('rend le nombre révoqué', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: { revoquerTousTokensAbonnes: 12 } }));
      expect(await service.revoquerTousTokensAbonnes()).toBe(12);
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: REVOQUER_TOUS_TOKENS_ABONNES });
    });

    it('rend 0 quand la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      expect(await service.revoquerTousTokensAbonnes()).toBe(0);
    });
  });

  describe('revoquerTokenAbonne', () => {
    it('rend true quand le token est révoqué', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: { revoquerTokenAbonne: true } }));
      const res = await service.revoquerTokenAbonne('tok-1');
      expect(mutateSpy).toHaveBeenCalledWith({ mutation: REVOQUER_TOKEN_ABONNE, variables: { tokenId: 'tok-1' } });
      expect(res).toBe(true);
    });

    it('rend false quand la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      expect(await service.revoquerTokenAbonne('tok-1')).toBe(false);
    });
  });
});
