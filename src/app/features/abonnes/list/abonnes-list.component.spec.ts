import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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
      latitude: null,
      longitude: null,
      dateMajPosition: null,
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
      latitude: null,
      longitude: null,
      dateMajPosition: null,
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
      latitude: null,
      longitude: null,
      dateMajPosition: null,
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

    it('resultCount bascule sur le compte filtré côté client dès qu’une recherche est active', async () => {
      const { component } = await setup(mockAbonnes);
      component.onSearchChange('diallo');
      expect(component.resultCount()).toBe(1); // filteredAbonnes(), pas totalCount()
    });
  });

  // ── Tri des colonnes (sortValue) ────────────────────────────────────────────
  // Ces fonctions ne s'exécutent que lorsque `app-data-table` trie une colonne
  // — jamais par un simple rendu du tableau.

  describe('colonnes — sortValue', () => {
    it('trie par numéro, nom complet, quartier, n° de compteur et statut', async () => {
      const { component } = await setup(mockAbonnes);
      const sortValue = Object.fromEntries(component.columns.map((c) => [c.key, c.sortValue]));
      expect(sortValue['numero']!(mockAbonnes[0])).toBe('AB-0001');
      expect(sortValue['nom']!(mockAbonnes[0])).toBe('Diallo Amadou');
      expect(sortValue['localisation']!(mockAbonnes[0])).toBe('Plateau');
      expect(sortValue['compteur']!(mockAbonnes[0])).toBe(1042);
      expect(sortValue['statut']!(mockAbonnes[0])).toBe('ACTIF');
    });

    it('un abonné sans compteur trie en dernier (quartier vide, n° à zéro)', async () => {
      const { component } = await setup(mockAbonnes);
      const sansCompteur = { id: '9', numeroAbonne: 'AB-0099', nom: 'X', prenom: 'Y', statut: 'ACTIF' } as AbonneLigne;
      const sortValue = Object.fromEntries(component.columns.map((c) => [c.key, c.sortValue]));
      expect(sortValue['localisation']!(sansCompteur)).toBe('');
      expect(sortValue['compteur']!(sansCompteur)).toBe(0);
    });
  });

  // ── Message vide selon les filtres actifs ───────────────────────────────────

  describe('emptyKey', () => {
    it('propose la clé générique sans filtre actif', async () => {
      const { component } = await setup([]);
      expect(component.emptyKey()).toBe('ABONNES.NO_RESULT');
    });

    it('propose la clé « aucun résultat pour ces filtres » dès qu’un filtre est actif', async () => {
      const { component } = await setup(mockAbonnes);
      component.statutFilter.set('RESILIE');
      expect(component.emptyKey()).toBe('ABONNES.NO_RESULT_FILTERS');
    });
  });

  // ── Résumé de statut — les deux formes singulier/pluriel de chaque compteur ──

  describe('statutSummary — singulier et pluriel', () => {
    it('accorde "1 actif" au singulier et "suspendus" au pluriel', async () => {
      const abonnes: AbonneLigne[] = [
        { ...mockAbonnes[0], statut: 'ACTIF' },
        { ...mockAbonnes[1], statut: 'SUSPENDU' },
        { ...mockAbonnes[2], statut: 'SUSPENDU' },
      ];
      const { component } = await setup(abonnes);
      expect(component.statutSummary()).toBe('1 actif · 2 suspendus');
    });
  });

  // ── Mise à jour temps réel (subscribeToMore) ────────────────────────────────

  describe('mise à jour temps réel', () => {
    it('remplace en place un abonné déjà listé quand abonneUpdated arrive', async () => {
      const { watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      const options = queryRef.subscribeToMore.mock.calls[0][0];

      const misAJour = { ...mockAbonnes[0], statut: 'SUSPENDU' };
      const resultat = options.updateQuery(
        { abonnes: mockAbonnes },
        { subscriptionData: { data: { abonneUpdated: misAJour } } },
      );

      expect(resultat.abonnes.find((a: AbonneLigne) => a?.id === '1').statut).toBe('SUSPENDU');
    });

    it('ne modifie rien quand la charge utile ne porte aucun abonné mis à jour', async () => {
      const { watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      const options = queryRef.subscribeToMore.mock.calls[0][0];

      const resultat = options.updateQuery(
        { abonnes: mockAbonnes },
        { subscriptionData: { data: { abonneUpdated: null } } },
      );

      expect(resultat).toBeUndefined();
    });

    it('une panne du flux temps réel reste sans effet (resynchronisation par refetch)', async () => {
      const { watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      const options = queryRef.subscribeToMore.mock.calls[0][0];
      expect(() => options.onError()).not.toThrow();
    });
  });

  // ── data?.abonnes absent alors que le chargement est terminé ────────────────

  it('signale une erreur non technique quand le flux répond sans données ni chargement', async () => {
    const { component } = await setup(
      [],
      of({ data: { abonnes: null }, loading: false }) as never,
    );
    expect(component.error()).toBe('ERRORS.LOAD_ABONNES');
    expect(component.abonnes()).toHaveLength(0);
  });

  // ── loadAbonnes() (bouton Réessayer du bandeau d'erreur) ────────────────────

  describe('loadAbonnes (bouton Réessayer)', () => {
    it('efface l’erreur et redemande la page (et le total, en mode serveur)', async () => {
      const { component, watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      component.error.set('Erreur précédente');

      await component.loadAbonnes();

      expect(queryRef.refetch).toHaveBeenCalled();
      expect(component.error()).toBeNull();
    });

    it('affiche le message non technique du nouvel échec', async () => {
      const { component, watchQuerySpy } = await setup(mockAbonnes);
      const queryRef = watchQuerySpy.mock.results[0].value;
      queryRef.refetch.mockRejectedValueOnce(new Error('Toujours indisponible'));

      await component.loadAbonnes();

      expect(component.error()).toBe('Toujours indisponible');
    });
  });

  // ── Actions sur une ligne ────────────────────────────────────────────────────

  describe('actions sur une ligne', () => {
    it('modifierAbonne navigue vers le formulaire d’édition de cet abonné', async () => {
      const { component } = await setup(mockAbonnes);
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      component.modifierAbonne('1');

      expect(navSpy).toHaveBeenCalledWith('/abonnes/1/modifier');
    });

    it('confirmReactiver mémorise la cible et ouvre la feuille de réactivation', async () => {
      const { component } = await setup(mockAbonnes);
      component.confirmReactiver(mockAbonnes[2]);
      expect(component.reactiverCible()).toEqual(mockAbonnes[2]);
      expect(component.reactiverDialogVisible()).toBe(true);
    });

    it('onReactivated met à jour la ligne, ferme la feuille et recharge les compteurs globaux', async () => {
      const { component, querySpy } = await setup(mockAbonnes);
      component.confirmReactiver(mockAbonnes[2]); // Traoré, SUSPENDU
      querySpy.mockClear();

      component.onReactivated('ACTIF');
      await Promise.resolve();
      await Promise.resolve();

      expect(component.abonnes().find((a) => a.id === '3')!.statut).toBe('ACTIF');
      expect(component.reactiverDialogVisible()).toBe(false);
      expect(querySpy).toHaveBeenCalled(); // chargerCountsGlobaux relancé (les puces globales ont changé)
    });

    it('onReactivated ne fait rien sans cible mémorisée (garde défensive)', async () => {
      const { component } = await setup(mockAbonnes);
      expect(() => component.onReactivated('ACTIF')).not.toThrow();
      expect(component.abonnes()).toEqual(mockAbonnes);
    });
  });

  // ── Variante d'avatar (M-05) ─────────────────────────────────────────────────

  describe('avatarVariant', () => {
    it('un abonné suspendu porte toujours la variante "suspendu"', async () => {
      const { component } = await setup(mockAbonnes);
      expect(component.avatarVariant(mockAbonnes[2])).toBe('suspendu');
    });

    it('un abonné résilié porte toujours la variante "resilie"', async () => {
      const { component } = await setup(mockAbonnes);
      const resilie = { ...mockAbonnes[0], statut: 'RESILIE' as StatutAbonne };
      expect(component.avatarVariant(resilie)).toBe('resilie');
    });

    it('un abonné actif porte un dégradé stable dérivé de son numéro', async () => {
      const { component } = await setup(mockAbonnes);
      const v1 = component.avatarVariant(mockAbonnes[0]);
      const v2 = component.avatarVariant(mockAbonnes[0]);
      expect(v1).toBe(v2);
      expect(v1).toMatch(/^g[0-3]$/);
    });

    it('sans numéro d’abonné (null/undefined), le dégradé se dérive du nom plutôt que de planter', async () => {
      const { component } = await setup(mockAbonnes);
      // `??` ne retombe que sur null/undefined, jamais sur une chaîne vide —
      // c'est bien cette valeur-là qui exerce la branche de repli sur `nom`.
      const sansNumero = { ...mockAbonnes[0], numeroAbonne: undefined } as unknown as AbonneLigne;
      expect(component.avatarVariant(sansNumero)).toMatch(/^g[0-3]$/);
    });
  });

  // ── Chargement des quartiers — dégradation silencieuse ──────────────────────

  it('un échec du chargement des quartiers laisse le filtre vide plutôt que de casser l’écran', async () => {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(mockAbonnes));
    const querySpy = vi.fn((options: { query: unknown }) => {
      if (options.query === GET_ABONNES_ACTIFS) return throwError(() => new Error('boom'));
      return of({ data: { abonnesCount: 0 } });
    });
    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: vi.fn(), query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(AbonnesListComponent);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.componentInstance.quartiersDisponibles()).toEqual([]);
  });

  // ── Chargement des compteurs globaux — un statut en échec n'efface pas les autres ──

  it('un seul comptage en échec retombe à zéro pour ce statut, sans invalider les autres', async () => {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(mockAbonnes));
    const querySpy = vi.fn((options: { query: unknown; variables?: { statut?: StatutAbonne } }) => {
      if (options.query === GET_ABONNES_COUNT) {
        if (options.variables?.statut === 'RESILIE') return throwError(() => new Error('boom'));
        const count = mockAbonnes.filter((a) => a.statut === options.variables?.statut).length;
        return of({ data: { abonnesCount: count } });
      }
      return of({ data: { abonnesActifs: [] } });
    });
    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: vi.fn(), query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(AbonnesListComponent);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const counts = fixture.componentInstance.filtersConfig().find((f) => f.key === 'statut');
    const resilies = counts?.options.find((o) => o.value === 'RESILIE');
    expect(resilies?.count).toBe(0);
    const actifs = counts?.options.find((o) => o.value === 'ACTIF');
    expect(actifs?.count).toBe(2);
  });

  // ── Garde défensive — appel avant que ngOnInit n'ait créé la requête ────────

  it('un changement de filtre avant ngOnInit ne plante pas (abonnesQuery pas encore créée)', () => {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef([]));
    const querySpy = vi.fn().mockReturnValue(of({ data: {} }));
    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: vi.fn(), query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(AbonnesListComponent);
    // Pas de `detectChanges()` : `ngOnInit` (qui crée `abonnesQuery`) n'a pas
    // encore tourné.
    expect(() => fixture.componentInstance.onSearchChange('x')).not.toThrow();
  });

  // ── Compléments de couverture des branches restantes ────────────────────────

  it('ngOnInit ne charge pas le total serveur si un filtre client était déjà actif avant l’initialisation', async () => {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(mockAbonnes));
    const querySpy = makeQuerySpy(mockAbonnes);
    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: vi.fn(), query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(AbonnesListComponent);
    // Signal déjà positionné avant que `ngOnInit` (qui lit `modeServeur()`) ne tourne.
    fixture.componentInstance.quartierFilter.set('Centre');
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(fixture.componentInstance.totalCount()).toBe(0); // jamais chargé
  });

  it('un flux encore en chargement, sans donnée, ne touche ni aux abonnés ni à l’erreur', async () => {
    const enCours = of({ data: { abonnes: undefined }, loading: true }) as never;
    const { component } = await setup(mockAbonnes, enCours);
    expect(component.error()).toBeNull();
    expect(component.abonnes()).toHaveLength(0);
    expect(component.loading()).toBe(true);
  });

  it('une erreur réseau sans message technique retombe sur le message générique traduit', async () => {
    const { component } = await setup([], throwError(() => 'panne réseau brute') as never);
    expect(component.error()).toBe('ERRORS.LOAD_ABONNES');
  });

  it('loadAbonnes, sans message technique, retombe sur le message générique en dur', async () => {
    const { component, watchQuerySpy } = await setup(mockAbonnes);
    const queryRef = watchQuerySpy.mock.results[0].value;
    queryRef.refetch.mockRejectedValueOnce('panne réseau brute');

    await component.loadAbonnes();

    expect(component.error()).toBe('Impossible de charger la liste des abonnés.');
  });

  it('loadAbonnes ne redemande pas le total serveur quand un filtre client est actif', async () => {
    const { component, watchQuerySpy, querySpy } = await setup(mockAbonnes);
    const queryRef = watchQuerySpy.mock.results[0].value;
    component.onSearchChange('diallo'); // bascule en mode client
    queryRef.refetch.mockClear();
    querySpy.mockClear();

    await component.loadAbonnes();

    expect(queryRef.refetch).toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalledWith(expect.objectContaining({ query: GET_ABONNES_COUNT }));
  });

  it('un abonné remplacé par la mise à jour temps réel garde intacts ses voisins non concernés', async () => {
    const { watchQuerySpy } = await setup(mockAbonnes);
    const queryRef = watchQuerySpy.mock.results[0].value;
    const options = queryRef.subscribeToMore.mock.calls[0][0];

    // `prev.abonnes` absent : exerce le repli `?? []` plutôt que la liste réelle.
    const resultat = options.updateQuery(
      {},
      { subscriptionData: { data: { abonneUpdated: { ...mockAbonnes[0], statut: 'SUSPENDU' } } } },
    );

    expect(resultat.abonnes).toEqual([]);
  });

  it('deux comptages simultanément en échec retombent chacun à zéro (Promise.allSettled)', async () => {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(mockAbonnes));
    const querySpy = vi.fn((options: { query: unknown; variables?: { statut?: StatutAbonne } }) => {
      if (options.query === GET_ABONNES_COUNT) return throwError(() => new Error('boom'));
      return of({ data: { abonnesActifs: [] } });
    });
    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: vi.fn(), query: querySpy } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(AbonnesListComponent);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const counts = fixture.componentInstance.filtersConfig().find((f) => f.key === 'statut');
    expect(counts?.options.every((o) => o.count === 0)).toBe(true);
  });
});
