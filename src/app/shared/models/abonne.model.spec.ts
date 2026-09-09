import { abonneStatutTone } from './abonne.model';

describe('abonneStatutTone', () => {
  it('ACTIF → success', () => {
    expect(abonneStatutTone('ACTIF')).toBe('success');
  });

  it('SUSPENDU → warning', () => {
    expect(abonneStatutTone('SUSPENDU')).toBe('warning');
  });

  it('RESILIE → danger', () => {
    expect(abonneStatutTone('RESILIE')).toBe('danger');
  });

  it('une valeur inconnue → neutral, jamais l’apparence d’un état voisin', () => {
    expect(abonneStatutTone('AUTRE')).toBe('neutral');
  });
});
