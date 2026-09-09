import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { CarteService } from './carte.service';
import type { AbonneLigne } from '../../../graphql/vues';
import type { LigneImportCoordonnees } from '../carte.model';

describe('CarteService', () => {
  let service: CarteService;
  let mutate: ReturnType<typeof vi.fn>;

  function abonne(p: Partial<AbonneLigne> = {}): AbonneLigne {
    return {
      id: 'a1',
      numeroAbonne: 'AB-0001',
      nom: 'Diallo',
      prenom: 'Amadou',
      statut: 'ACTIF',
      compteur: {
        id: 'c1',
        numeroCompteur: 1234,
        quartier: 'Bonapriso',
        camp: 1,
        statut: 'ACTIF',
        latitude: null,
        longitude: null,
        dateMajPosition: null,
      },
      ...p,
    } as AbonneLigne;
  }

  beforeEach(() => {
    mutate = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Apollo, useValue: { mutate } }],
    });
    service = TestBed.inject(CarteService);
  });

  describe('toGeoPoint', () => {
    it('renvoie null si le compteur est absent', () => {
      expect(service.toGeoPoint(abonne({ compteur: null }))).toBeNull();
    });

    it('renvoie null si latitude/longitude ne sont pas renseignées', () => {
      expect(service.toGeoPoint(abonne())).toBeNull();
    });

    it('construit un point à partir d\'un compteur géolocalisé', () => {
      const a = abonne({
        statut: 'SUSPENDU',
        compteur: {
          id: 'c2',
          numeroCompteur: 42,
          quartier: 'Akwa',
          camp: 2,
          statut: 'ACTIF',
          latitude: 4.05,
          longitude: 9.7,
          dateMajPosition: '2026-09-01T00:00:00.000Z',
        },
      });
      expect(service.toGeoPoint(a)).toEqual({
        abonneId: 'a1',
        numeroCompteur: 42,
        quartier: 'Akwa',
        statut: 'SUSPENDU',
        latitude: 4.05,
        longitude: 9.7,
        dateMajPosition: '2026-09-01T00:00:00.000Z',
      });
    });
  });

  describe('importerCoordonnees', () => {
    function ligne(p: Partial<LigneImportCoordonnees> = {}): LigneImportCoordonnees {
      return {
        ligne: 1,
        numeroCompteurBrut: '1042',
        latitudeBrut: '4.05',
        longitudeBrut: '9.7',
        statut: 'A_IMPORTER',
        erreur: '',
        ...p,
      };
    }

    it('n\'envoie que les lignes A_IMPORTER, en valeurs brutes', async () => {
      mutate.mockReturnValue(
        of({ data: { importerCoordonneesCompteurs: { nbImportees: 1, erreurs: [] } } }),
      );
      const lignes = [ligne(), ligne({ ligne: 2, statut: 'FORMAT_INVALIDE', erreur: 'x' })];

      const resultat = await service.importerCoordonnees(lignes);

      expect(mutate).toHaveBeenCalledTimes(1);
      const args = mutate.mock.calls[0][0];
      expect(args.variables.coordonnees).toEqual([
        { numeroCompteur: '1042', latitude: '4.05', longitude: '9.7' },
      ]);
      expect(resultat).toEqual({ nbImportees: 1, erreurs: [] });
    });

    it('remonte le résultat serveur, erreurs incluses', async () => {
      mutate.mockReturnValue(
        of({
          data: {
            importerCoordonneesCompteurs: {
              nbImportees: 0,
              erreurs: [{ numeroCompteur: 'abc', message: 'numéro invalide' }],
            },
          },
        }),
      );
      const resultat = await service.importerCoordonnees([ligne({ numeroCompteurBrut: 'abc' })]);
      expect(resultat.nbImportees).toBe(0);
      expect(resultat.erreurs).toEqual([{ numeroCompteur: 'abc', message: 'numéro invalide' }]);
    });

    it('rejette si la réponse serveur est vide', async () => {
      mutate.mockReturnValue(of({ data: null }));
      await expect(service.importerCoordonnees([ligne()])).rejects.toThrow('Réponse invalide du serveur');
    });
  });
});
