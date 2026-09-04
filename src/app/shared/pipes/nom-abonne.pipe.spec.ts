import { NomAbonnePipe } from './nom-abonne.pipe';

describe('NomAbonnePipe', () => {
  const pipe = new NomAbonnePipe();

  it('compose prénom puis nom', () => {
    expect(pipe.transform('Jean', 'Dupont')).toBe('Jean Dupont');
  });

  it('ne garde que le prénom quand le nom est absent', () => {
    expect(pipe.transform('Jean', undefined)).toBe('Jean');
  });

  it('ne garde que le nom quand le prénom est absent', () => {
    expect(pipe.transform(undefined, 'Dupont')).toBe('Dupont');
  });

  it('rend une chaîne vide quand tout est absent', () => {
    expect(pipe.transform(null, null)).toBe('');
    expect(pipe.transform(undefined, undefined)).toBe('');
  });

  it('élague les espaces de chaque partie', () => {
    expect(pipe.transform('  Jean  ', '  Dupont  ')).toBe('Jean Dupont');
  });
});
