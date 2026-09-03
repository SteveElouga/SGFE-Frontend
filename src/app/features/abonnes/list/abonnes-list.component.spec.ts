import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AbonnesListComponent } from './abonnes-list.component';
import { GET_ABONNES_ACTIFS, GET_ABONNES_COUNT } from '../../../graphql/queries/abonnes.queries';
import type { AbonneLigne } from '../../../graphql/vues';
import type { StatutAbonne } from '../../../shared/models/abonne.model';

// La fixture porte exactement `AbonneListFields` — la sélection de la liste.
// Elle décrivait avant le type du schéma : elle remplissait `telephoneWhatsapp`,
// `createdAt`, `indexInitial` et `datePose`, que `GET_ABONNES` ne demande pas.
// Le test montait donc un composant nourri de champs qu'il ne reçoit jamais.
const mockAbonnes: AbonneLigne[] = [
  {
    id: '1',
    numeroAbonne: 'AB-0001',
    nom: 'Diallo',
    prenom: 'Amadou',
    statut: 'ACTIF',
    compteur: {
      id: 'c1',
      numeroCompteur: 1042,
      quartier: 'Plateau',
      camp: 3,
      statut: 'ACTIF',
    },
  },
  {
    id: '2',
    numeroAbonne: 'AB-0002',
    nom: 'Koné',
    prenom: 'Mariam',
    statut: 'ACTIF',
    compteur: {
      id: 'c2',
      numeroCompteur: 387,
      quartier: 'Centre',
      camp: 1,
      statut: 'ACTIF',
    },
  },
  {
    id: '3',
    numeroAbonne: 'AB-0008',
    nom: 'Traoré',
    prenom: 'Seydou',
    statut: 'SUSPENDU',
    compteur: {
      id: 'c3',
      numeroCompteur: 122,
      quartier: 'Plateau',
      camp: 1,
      statut: 'ACTIF',
    },
  },
];

describe('AbonnesListComponent', () => {
  // Stub minimal de QueryRef renvoyé par apollo.watchQuery (le composant charge
  // via `valueChanges` dans ngOnInit et retente via `refetch`).
  function makeQueryRef(abonnes: AbonneLigne[], valueChanges = of({ data: { abonnes }, loading: false })) {
    return {
      valueChanges,
      subscribeToMore: vi.fn(),
      refetch: vi.fn().mockResolvedValue({ data: { abonnes } }),
      setVariables: vi.fn().mockResolvedValue({ data: { abonnes } }),
    };
  }

  /**
   * Depuis la pagination serveur, `AbonnesListComponent` charge en plus deux
   * requêtes `apollo.query` indépendantes de `watchQuery` : les compteurs par
   * statut (`abonnesCount`, pour le résumé et les puces) et les quartiers
   * disponibles (`abonnesActifs`, pour le select). Ce stub les dérive du même
   * jeu `abonnes` que `watchQuery`, pour que les tests existants (résumé,
   * options quartier) continuent de valoir sans donnée dupliquée.
   */
  function makeQuerySpy(abonnes: AbonneLigne[]) {
    return vi.fn((options: { query: unknown; variables?: { statut?: StatutAbonne } }) => {
      if (options.query === GET_ABONNES_COUNT) {
        const statut = options.variables?.statut;
        const count = statut ? abonnes.filter((a) => a.statut === statut).length : abonnes.length;
        return of({ data: { abonnesCount: count } });
      }
      if (options.query === GET_ABONNES_ACTIFS) {
        return of({
          data: {
            abonnesActifs: abonnes.map((a) => ({
              id: a.id,
              compteur: a.compteur ? { quartier: a.compteur.quartier, camp: a.compteur.camp } : null,
            })),
          },
        });
      }
      return of({ data: {} });
    });
  }

  async function setup(abonnes: AbonneLigne[] = [], valueChanges?: ReturnType<typeof of>) {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(abonnes, valueChanges));
    const mutateSpy = vi.fn();
    const querySpy = makeQuerySpy(abonnes);

    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: mutateSpy, query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });

    // Libellés nécessaires au calcul du résumé de statut.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: {
        SUMMARY_ACTIF_PLURAL: '{{count}} actifs',
        SUMMARY_ACTIF_SINGULAR: '{{count}} actif',
        SUMMARY_SUSPENDU_PLURAL: '{{count}} suspendus',
        SUMMARY_SUSPENDU_SINGULAR: '{{count}} suspendu',
      },
    });
    translate.use('fr');

    const fixture = TestBed.createComponent(AbonnesListComponent);
    fixture.detectChanges(); // déclenche ngOnInit → charge via valueChanges
    // `chargerCountsGlobaux`/`chargerQuartiers` sont des `apollo.query` en vol
    // (fire-and-forget côté ngOnInit) : on laisse leurs microtâches se résoudre
    // avant de lire `statutSummary`/`filtersConfig`, qui en dépendent désormais.
    await Promise.resolve();
    await Promise.resolve();
    return { fixture, component: fixture.componentInstance, watchQuerySpy, mutateSpy, querySpy };
  }

  it('should create', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('loads abonnés and clears loading state', async () => {
    const { component } = await setup(mockAbonnes);
    expect(component.abonnes()).toHaveLength(3);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('sets an error message when the query stream fails', async () => {
    // Message non-technique → il est remonté tel quel (cf. sanitizeGqlMessage).
    const { component } = await setup([], throwError(() => new Error('Le serveur est indisponible')));
    expect(component.error()).toBe('Le serveur est indisponible');
    expect(component.loading()).toBe(false);
    expect(component.abonnes()).toHaveLength(0);
  });

  it('filters by nom (case-insensitive)', async () => {
    const { component } = await setup(mockAbonnes);
    component.searchTerm.set('diallo');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].nom).toBe('Diallo');
  });

  it('filters by numeroAbonne', async () => {
    const { component } = await setup(mockAbonnes);
    component.searchTerm.set('AB-0002');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].numeroAbonne).toBe('AB-0002');
  });

  it('filters by statut', async () => {
    const { component } = await setup(mockAbonnes);
    component.statutFilter.set('SUSPENDU');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].statut).toBe('SUSPENDU');
  });

  it('filters by quartier', async () => {
    const { component } = await setup(mockAbonnes);
    component.quartierFilter.set('Centre');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].compteur?.quartier).toBe('Centre');
  });

  it('combines search and statut filters', async () => {
    const { component } = await setup(mockAbonnes);
    component.statutFilter.set('ACTIF');
    component.searchTerm.set('ko');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].nom).toBe('Koné');
  });

  it('computes correct statut summary', async () => {
    const { component } = await setup(mockAbonnes);
    expect(component.statutSummary()).toBe('2 actifs · 1 suspendu');
  });

  it('derives unique sorted quartier options', async () => {
    const { component } = await setup(mockAbonnes);
    // Batch 10 : les options quartier sont projetées dans `filtersConfig`
    // (panneau de filtres unifié) et non plus dans un computed dédié. Depuis
    // la pagination serveur, elles viennent de `abonnesActifs` (léger, plein
    // périmètre) et non plus de la page affichée.
    const quartier = component.filtersConfig().find((f) => f.key === 'quartier');
    expect(quartier?.options.map((o) => o.value)).toEqual(['Centre', 'Plateau']);
  });

  it('returns empty string for statut summary when no abonnés', async () => {
    const { component } = await setup();
    expect(component.statutSummary()).toBe('');
  });

  describe('pagination serveur', () => {
    it('modeServeur est actif par défaut (ni recherche ni quartier)', async () => {
      const { component } = await setup(mockAbonnes);
      expect(component.modeServeur()).toBe(true);
    });

    it('bascule en mode client dès qu\'une recherche est saisie', async () => {
      const { component } = await setup(mockAbonnes);
      component.onSearchChange('diallo');
      expect(component.modeServeur()).toBe(false);
    });

    it('bascule en mode client dès qu\'un quartier est choisi', async () => {
      const { component } = await setup(mockAbonnes);
      component.onFiltersChange({ statut: null, quartier: 'Centre' });
      expect(component.modeServeur()).toBe(false);
    });

    it('onPageChange demande la page suivante avec le bon offset', async () => {
      const { component, watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;

      component.onPageChange(2);

      expect(component.pageIndex()).toBe(2);
      expect(queryRef.setVariables).toHaveBeenCalledWith({
        statut: undefined,
        limit: component.PAGE_SIZE,
        offset: 2 * component.PAGE_SIZE,
      });
    });

    it('un changement de filtre statut revient à la page 0', async () => {
      const { component, watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      component.onPageChange(3);

      component.onFiltersChange({ statut: 'ACTIF', quartier: null });

      expect(component.pageIndex()).toBe(0);
      expect(queryRef.setVariables).toHaveBeenLastCalledWith({
        statut: 'ACTIF',
        limit: component.PAGE_SIZE,
        offset: 0,
      });
    });

    it('en mode client (quartier actif), la requête repart sans limit/offset', async () => {
      const { component, watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;

      component.onFiltersChange({ statut: null, quartier: 'Centre' });

      expect(queryRef.setVariables).toHaveBeenLastCalledWith({ statut: undefined });
    });
  });
});
