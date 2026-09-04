import { nomAbonne, nomAbonneOuReference } from './abonne.utils';

describe('nomAbonne', () => {
  it('compose prénom puis nom, dans cet ordre', () => {
    expect(nomAbonne('Jean', 'Dupont')).toBe('Jean Dupont');
  });

  it('ne garde que le prénom quand le nom est absent', () => {
    expect(nomAbonne('Jean', undefined)).toBe('Jean');
    expect(nomAbonne('Jean', null)).toBe('Jean');
  });

  it('ne garde que le nom quand le prénom est absent', () => {
    expect(nomAbonne(undefined, 'Dupont')).toBe('Dupont');
    expect(nomAbonne(null, 'Dupont')).toBe('Dupont');
  });

  it('rend une chaîne vide quand les deux sont absents', () => {
    expect(nomAbonne(undefined, undefined)).toBe('');
    expect(nomAbonne(null, null)).toBe('');
  });

  it('élague les espaces de chaque partie', () => {
    expect(nomAbonne('  Jean  ', '  Dupont  ')).toBe('Jean Dupont');
  });

  it('traite une partie faite uniquement d’espaces comme absente', () => {
    expect(nomAbonne('   ', 'Dupont')).toBe('Dupont');
    expect(nomAbonne('Jean', '   ')).toBe('Jean');
    expect(nomAbonne('   ', '   ')).toBe('');
  });

  it('traite une chaîne vide comme absente', () => {
    expect(nomAbonne('', '')).toBe('');
  });
});

describe('nomAbonneOuReference', () => {
  it('affiche le nom composé quand il existe', () => {
    expect(nomAbonneOuReference('Jean Dupont', 'AB-0016')).toBe('Jean Dupont');
  });

  it('élague le nom composé', () => {
    expect(nomAbonneOuReference('  Jean Dupont  ', 'AB-0016')).toBe('Jean Dupont');
  });

  it('retombe sur le numéro d’abonné quand le nom est absent', () => {
    expect(nomAbonneOuReference(undefined, 'AB-0016')).toBe('AB-0016');
    expect(nomAbonneOuReference(null, 'AB-0016')).toBe('AB-0016');
    expect(nomAbonneOuReference('', 'AB-0016')).toBe('AB-0016');
  });

  it('traite un nom composé fait uniquement d’espaces comme absent', () => {
    expect(nomAbonneOuReference('   ', 'AB-0016')).toBe('AB-0016');
  });

  it('retombe sur un tiret cadratin quand rien n’est exploitable', () => {
    expect(nomAbonneOuReference(undefined, undefined)).toBe('—');
    expect(nomAbonneOuReference('', '')).toBe('—');
    expect(nomAbonneOuReference('   ', '   ')).toBe('—');
  });

  it('élague aussi le numéro d’abonné', () => {
    expect(nomAbonneOuReference(undefined, '  AB-0016  ')).toBe('AB-0016');
  });
});
