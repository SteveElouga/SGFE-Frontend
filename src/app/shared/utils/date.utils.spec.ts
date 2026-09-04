import { fromIsoDate, toIsoDate } from './date.utils';

describe('toIsoDate', () => {
  it('rend une chaîne vide pour null/undefined', () => {
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(undefined)).toBe('');
  });

  it('formate en yyyy-mm-dd avec le zéro de tête', () => {
    // 3 janvier 2026 : mois et jour à un chiffre, le padding doit s'appliquer.
    expect(toIsoDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('formate sans padding superflu sur une date à deux chiffres', () => {
    expect(toIsoDate(new Date(2026, 10, 25))).toBe('2026-11-25');
  });

  it('reste en heure locale — n’applique aucune conversion UTC', () => {
    // Construit à partir des composants locaux : si la fonction passait par
    // toISOString(), un fuseau positif ferait basculer au jour suivant.
    const d = new Date(2026, 7, 27, 23, 45);
    expect(toIsoDate(d)).toBe('2026-08-27');
  });
});

describe('fromIsoDate', () => {
  it('rend null pour une valeur absente', () => {
    expect(fromIsoDate(null)).toBeNull();
    expect(fromIsoDate(undefined)).toBeNull();
    expect(fromIsoDate('')).toBeNull();
  });

  it('rend null pour un format non reconnu', () => {
    expect(fromIsoDate('pas-une-date')).toBeNull();
    expect(fromIsoDate('27/08/2026')).toBeNull();
    expect(fromIsoDate('2026/08/27')).toBeNull();
  });

  it('parse yyyy-mm-dd en date locale à minuit', () => {
    const d = fromIsoDate('2026-08-27');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7); // 0-indexé
    expect(d!.getDate()).toBe(27);
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
  });

  it('accepte un préfixe yyyy-mm-dd même suivi d’un horodatage', () => {
    const d = fromIsoDate('2026-08-27T14:30:00+01:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(27);
  });

  it('fait l’aller-retour avec toIsoDate', () => {
    expect(toIsoDate(fromIsoDate('2026-01-05'))).toBe('2026-01-05');
  });
});
