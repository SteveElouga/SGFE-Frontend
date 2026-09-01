import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AbonnesListComponent } from './abonnes-list.component';
import type { AbonneLigne } from '../../../graphql/vues';

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
    };
  }

  function setup(abonnes: AbonneLigne[] = [], valueChanges?: ReturnType<typeof of>) {
    const watchQuerySpy = vi.fn().mockReturnValue(makeQueryRef(abonnes, valueChanges));
    const mutateSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [AbonnesListComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { watchQuery: watchQuerySpy, mutate: mutateSpy } },
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
    return { fixture, component: fixture.componentInstance, watchQuerySpy, mutateSpy };
  }

  it('should create', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('loads abonnés and clears loading state', async () => {
    const { component } = setup(mockAbonnes);
    expect(component.abonnes()).toHaveLength(3);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('sets an error message when the query stream fails', () => {
    // Message non-technique → il est remonté tel quel (cf. sanitizeGqlMessage).
    const { component } = setup([], throwError(() => new Error('Le serveur est indisponible')));
    expect(component.error()).toBe('Le serveur est indisponible');
    expect(component.loading()).toBe(false);
    expect(component.abonnes()).toHaveLength(0);
  });

  it('filters by nom (case-insensitive)', async () => {
    const { component } = setup(mockAbonnes);
    component.searchTerm.set('diallo');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].nom).toBe('Diallo');
  });

  it('filters by numeroAbonne', async () => {
    const { component } = setup(mockAbonnes);
    component.searchTerm.set('AB-0002');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].numeroAbonne).toBe('AB-0002');
  });

  it('filters by statut', async () => {
    const { component } = setup(mockAbonnes);
    component.statutFilter.set('SUSPENDU');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].statut).toBe('SUSPENDU');
  });

  it('filters by quartier', async () => {
    const { component } = setup(mockAbonnes);
    component.quartierFilter.set('Centre');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].compteur?.quartier).toBe('Centre');
  });

  it('combines search and statut filters', async () => {
    const { component } = setup(mockAbonnes);
    component.statutFilter.set('ACTIF');
    component.searchTerm.set('ko');
    expect(component.filteredAbonnes()).toHaveLength(1);
    expect(component.filteredAbonnes()[0].nom).toBe('Koné');
  });

  it('computes correct statut summary', async () => {
    const { component } = setup(mockAbonnes);
    expect(component.statutSummary()).toBe('2 actifs · 1 suspendu');
  });

  it('derives unique sorted quartier options', async () => {
    const { component } = setup(mockAbonnes);
    // Batch 10 : les options quartier sont projetées dans `filtersConfig`
    // (panneau de filtres unifié) et non plus dans un computed dédié.
    const quartier = component.filtersConfig().find((f) => f.key === 'quartier');
    expect(quartier?.options.map((o) => o.value)).toEqual(['Centre', 'Plateau']);
  });

  it('returns empty string for statut summary when no abonnés', () => {
    const { component } = setup();
    expect(component.statutSummary()).toBe('');
  });
});
