import { creerElementMarqueur, derniers4Chiffres } from './marqueur.util';
import type { CompteurGeoPoint } from '../carte.model';

function point(overrides: Partial<CompteurGeoPoint> = {}): CompteurGeoPoint {
  return {
    abonneId: 'a1',
    numeroCompteur: 123456,
    quartier: 'Bonapriso',
    statut: 'ACTIF',
    latitude: 4.05,
    longitude: 9.7,
    dateMajPosition: null,
    ...overrides,
  };
}

describe('derniers4Chiffres', () => {
  it('garde les 4 derniers chiffres d’un grand numéro', () => {
    expect(derniers4Chiffres(123456)).toBe('3456');
  });

  it('complète à gauche par des zéros un numéro court', () => {
    expect(derniers4Chiffres(7)).toBe('0007');
    expect(derniers4Chiffres(42)).toBe('0042');
  });

  it('ignore un éventuel signe négatif', () => {
    expect(derniers4Chiffres(-42)).toBe('0042');
  });
});

describe('creerElementMarqueur', () => {
  it('affiche les 4 derniers chiffres du numéro de compteur', () => {
    const el = creerElementMarqueur(point({ numeroCompteur: 987654 }));
    expect(el.textContent).toBe('7654');
  });

  it('porte une classe de teinte selon le statut de l’abonné (ACTIF → success)', () => {
    const el = creerElementMarqueur(point({ statut: 'ACTIF' }));
    expect(el.className).toContain('carte-marqueur--success');
  });

  it('porte la teinte warning pour un abonné SUSPENDU', () => {
    const el = creerElementMarqueur(point({ statut: 'SUSPENDU' }));
    expect(el.className).toContain('carte-marqueur--warning');
  });

  it('porte la teinte danger pour un abonné RESILIE', () => {
    const el = creerElementMarqueur(point({ statut: 'RESILIE' }));
    expect(el.className).toContain('carte-marqueur--danger');
  });

  it('porte un libellé accessible (aria-label)', () => {
    const el = creerElementMarqueur(point({ numeroCompteur: 4242, quartier: 'Akwa' }));
    expect(el.getAttribute('aria-label')).toContain('4242');
    expect(el.getAttribute('aria-label')).toContain('Akwa');
  });
});
