import { BACKEND_CAPABILITIES, hasCapability } from './backend-capabilities';

/**
 * Ces flags évoluent avec ce que livre le backend (voir les commentaires du
 * fichier source) : les valeurs attendues ci-dessous sont celles constatées à
 * l'écriture de ce test. Un flag qui bascule est un changement volontaire —
 * ce test doit alors être mis à jour avec lui, pas contourné.
 */
describe('hasCapability', () => {
  it('rend exactement la valeur déclarée pour une capacité livrée (true)', () => {
    expect(hasCapability('ACTIVATION_ACTIONS')).toBe(true);
    expect(BACKEND_CAPABILITIES.ACTIVATION_ACTIONS).toBe(true);
  });

  it('rend exactement la valeur déclarée pour une capacité non livrée (false)', () => {
    expect(hasCapability('RELANCE_EVENTS')).toBe(false);
    expect(BACKEND_CAPABILITIES.RELANCE_EVENTS).toBe(false);
  });

  it('ne confond pas deux capacités distinctes', () => {
    // CAMPAGNE_AGENTS_READ (false) et CAMPAGNE_FILTRE_ZONES (true) partagent le
    // préfixe CAMPAGNE_ : une mauvaise clé de lookup les confondrait.
    expect(hasCapability('CAMPAGNE_AGENTS_READ')).toBe(false);
    expect(hasCapability('CAMPAGNE_FILTRE_ZONES')).toBe(true);
  });

  it('couvre chaque capacité déclarée sans en oublier', () => {
    for (const cle of Object.keys(BACKEND_CAPABILITIES) as (keyof typeof BACKEND_CAPABILITIES)[]) {
      expect(hasCapability(cle)).toBe(BACKEND_CAPABILITIES[cle]);
    }
  });

  it('rend un booléen strict, jamais une valeur tronquée ou une chaîne', () => {
    expect(typeof hasCapability('ACTIVATION_ACTIONS')).toBe('boolean');
    expect(typeof hasCapability('RELANCE_EVENTS')).toBe('boolean');
  });
});
