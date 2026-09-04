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
});
