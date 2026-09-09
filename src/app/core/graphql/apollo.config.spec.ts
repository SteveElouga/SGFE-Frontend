import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { apolloCache, apolloProviders } from './apollo.config';

/**
 * Le point le plus fragile de cette configuration n'est pas visible à la
 * lecture : `typePolicies` décide, pour chaque type, quel champ identifie une
 * entité dans le cache normalisé. Une mauvaise clé (ou son absence) fait
 * cohabiter deux campagnes différentes sous la même entrée de cache, ou
 * empêche une mise à jour temps réel de retrouver la bonne ligne — exactement
 * le bug documenté en tête de fichier (`ABONNE_UPDATED_SUB`).
 *
 * `apolloOptionsFactory` (le choix HTTP vs WebSocket, l'URL dérivée de
 * `location`, le lien d'authentification WS) reste privé et n'est pas exporté :
 * il n'est exercé qu'à la construction réelle du service `Apollo`, vérifiée
 * ci-dessous par un test d'intégration léger (pas de vrai réseau : le lien
 * WebSocket ne se connecte qu'à la première subscription, jamais ici).
 *
 * Note de couverture : une version antérieure de ce fichier tentait
 * d'espionner/mocker `graphql-ws` (`vi.mock`/`vi.spyOn`) pour inspecter les
 * arguments réels de `createClient` (URL dérivée de `location`, en-tête
 * `connectionParams` différé) et ainsi couvrir `urlWebSocketGraphQL` et le
 * callback d'authentification WS. Les deux approches se sont révélées
 * incompatibles avec ce test runner : la suite complète exécute tous les
 * fichiers de specs dans UN SEUL contexte partagé (`isolate: false`, choisi
 * pour se rapprocher de Karma/Jasmine — voir `angular.json`), donc `graphql-ws`
 * est déjà chargé pour de vrai par d'autres specs avant que le `vi.mock` de
 * CE fichier ne s'exécute (erreur `Cannot access '__vi_import_N__' before
 * initialization`), et son export nommé n'est de toute façon pas
 * reconfigurable en ESM réel (`vi.spyOn` échoue avec « Module namespace is
 * not configurable »). Plutôt que de risquer une suite complète instable pour
 * un gain marginal sur ce fichier, ces deux branches restent non couvertes ici
 * (voir le rapport de couverture) : `urlWebSocketGraphQL` (le choix ws/wss et
 * le repli sans `location`) et le contenu du callback `connectionParams`.
 */
describe('apolloCache · typePolicies', () => {
  it('normalise Campagne par campagneId, pas par id', () => {
    const cle = apolloCache.identify({ __typename: 'Campagne', campagneId: 'c1' });
    expect(cle).toBeDefined();
    expect(apolloCache.identify({ __typename: 'Campagne', id: 'ignore-moi', campagneId: 'c1' })).toBe(cle);
  });

  it('deux campagnes de campagneId différent obtiennent des clés différentes', () => {
    const a = apolloCache.identify({ __typename: 'Campagne', campagneId: 'c1' });
    const b = apolloCache.identify({ __typename: 'Campagne', campagneId: 'c2' });
    expect(a).not.toBe(b);
  });

  it('normalise Releve par releveId', () => {
    const cle = apolloCache.identify({ __typename: 'Releve', releveId: 'r1' });
    expect(cle).toBeDefined();
    expect(apolloCache.identify({ __typename: 'Releve', id: 'autre', releveId: 'r1' })).toBe(cle);
  });

  it('normalise Progression par campagneId (une progression par campagne)', () => {
    const cle = apolloCache.identify({ __typename: 'Progression', campagneId: 'c1' });
    expect(cle).toBeDefined();
  });

  it('normalise DernierIndex par abonneId', () => {
    const cle = apolloCache.identify({ __typename: 'DernierIndex', abonneId: 'a1' });
    expect(cle).toBeDefined();
  });

  it.each(['CampagneAgent', 'ReleveAbonne'])(
    '%s est stocké inline (keyFields: false) — pas d’identifiant propre',
    (typename) => {
      expect(apolloCache.identify({ __typename: typename, id: 'x', campagneId: 'c1' })).toBeUndefined();
    },
  );

  it('un type sans policy déclarée retombe sur le comportement par défaut (id/_id)', () => {
    expect(apolloCache.identify({ __typename: 'Abonne', id: 'a1' })).toBeDefined();
  });
});

describe('apolloProviders', () => {
  it('s’enregistre sans erreur et construit le service Apollo (aucun réseau réel déclenché)', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), ...apolloProviders] });
    expect(() => TestBed.inject(Apollo)).not.toThrow();
  });

  it('le service Apollo construit partage bien le cache exporté (mêmes typePolicies)', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), ...apolloProviders] });
    const apollo = TestBed.inject(Apollo);
    expect(apollo.client.cache).toBe(apolloCache);
  });

  it('construit deux fois de suite sans effet de bord (chaque instance a son propre lien WS différé)', () => {
    // Reconstruire le service Apollo à froid (nouveau TestBed) exécute à
    // nouveau `apolloOptionsFactory` en entier — deuxième garde-fou léger
    // contre une régression dans sa construction (ordre des providers,
    // double-inscription du lien d'erreurs, etc.), sans dépendre d'un mock
    // fragile de `graphql-ws` (voir la note de couverture ci-dessus).
    TestBed.configureTestingModule({ providers: [provideHttpClient(), ...apolloProviders] });
    const premier = TestBed.inject(Apollo);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), ...apolloProviders] });
    const second = TestBed.inject(Apollo);

    expect(premier.client).not.toBe(second.client);
    expect(second.client.cache).toBe(apolloCache);
  });
});
