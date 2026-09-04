import { CompteurPipe } from './compteur.pipe';

describe('CompteurPipe', () => {
  const pipe = new CompteurPipe();

  it('rend un tiret cadratin pour null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('rend un tiret cadratin pour undefined', () => {
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('préfixe C- et complète à 4 chiffres', () => {
    expect(pipe.transform(16)).toBe('C-0016');
  });

  it('gère le zéro comme un numéro valide, pas comme une absence', () => {
    expect(pipe.transform(0)).toBe('C-0000');
  });

  it('ne tronque pas un numéro déjà plus long que 4 chiffres', () => {
    expect(pipe.transform(12345)).toBe('C-12345');
  });

  it('complète correctement un numéro à un seul chiffre', () => {
    expect(pipe.transform(7)).toBe('C-0007');
  });
});
