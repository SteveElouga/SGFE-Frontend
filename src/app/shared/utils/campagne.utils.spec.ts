import { nomCampagneAffichable, suffixeCampagne } from './campagne.utils';

describe('suffixeCampagne', () => {
  it('rend null quand la date de création est absente', () => {
    expect(suffixeCampagne(null, 'fr')).toBeNull();
    expect(suffixeCampagne(undefined, 'fr')).toBeNull();
    expect(suffixeCampagne('', 'fr')).toBeNull();
  });

  it('rend null quand la date est illisible', () => {
    expect(suffixeCampagne('pas-une-date', 'fr')).toBeNull();
  });

  it('formate jour/mois en fr-FR', () => {
    const attendu = new Date('2026-08-15').toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });
    expect(suffixeCampagne('2026-08-15', 'fr')).toBe(attendu);
  });

  it('formate en en-US quand lang vaut "en"', () => {
    const attendu = new Date('2026-08-15').toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
    });
    expect(suffixeCampagne('2026-08-15', 'en')).toBe(attendu);
  });

  it('toute langue autre que "en" retombe sur fr-FR', () => {
    const attendu = new Date('2026-08-15').toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });
    expect(suffixeCampagne('2026-08-15', 'de')).toBe(attendu);
  });
});

describe('nomCampagneAffichable', () => {
  it('rend le nom tel quel sans homonyme', () => {
    expect(
      nomCampagneAffichable({ nom: 'Août 2026', nbHomonymes: 1, lang: 'fr', dateCreation: '2026-08-01' }),
    ).toBe('Août 2026');
  });

  it('rend le nom tel quel quand nbHomonymes vaut 0', () => {
    expect(nomCampagneAffichable({ nom: 'Août 2026', nbHomonymes: 0, lang: 'fr' })).toBe('Août 2026');
  });

  it('suffixe par la date de création quand il y a homonymie', () => {
    const date = suffixeCampagne('2026-08-01', 'fr');
    expect(
      nomCampagneAffichable({ nom: 'Août 2026', nbHomonymes: 2, lang: 'fr', dateCreation: '2026-08-01' }),
    ).toBe(`Août 2026 · créée le ${date}`);
  });

  it('retombe sur un fragment d’identifiant quand la date manque', () => {
    expect(
      nomCampagneAffichable({
        nom: 'Août 2026',
        nbHomonymes: 2,
        lang: 'fr',
        dateCreation: null,
        replisurId: 'abcdef12-3456',
      }),
    ).toBe('Août 2026 · abcdef');
  });

  it('retombe sur un fragment d’identifiant quand la date est illisible', () => {
    expect(
      nomCampagneAffichable({
        nom: 'Août 2026',
        nbHomonymes: 2,
        lang: 'fr',
        dateCreation: 'pas-une-date',
        replisurId: 'abcdef12-3456',
      }),
    ).toBe('Août 2026 · abcdef');
  });

  it('rend le nom seul quand ni date ni identifiant ne sont exploitables', () => {
    expect(
      nomCampagneAffichable({ nom: 'Août 2026', nbHomonymes: 2, lang: 'fr', dateCreation: null }),
    ).toBe('Août 2026');
  });
});
