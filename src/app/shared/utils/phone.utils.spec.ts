import {
  isValidCameroonPhone,
  maskPhone,
  normalizePhone,
  toLocalPhone,
} from './phone.utils';

describe('isValidCameroonPhone', () => {
  it('accepte un numéro à 8 chiffres (borne basse)', () => {
    expect(isValidCameroonPhone('61234567')).toBe(true);
  });

  it('accepte un numéro à 9 chiffres', () => {
    expect(isValidCameroonPhone('612345678')).toBe(true);
  });

  it('accepte un numéro à 15 chiffres (borne haute)', () => {
    expect(isValidCameroonPhone('123456789012345')).toBe(true);
  });

  it('refuse un numéro à 7 chiffres', () => {
    expect(isValidCameroonPhone('1234567')).toBe(false);
  });

  it('refuse un numéro à 16 chiffres', () => {
    expect(isValidCameroonPhone('1234567890123456')).toBe(false);
  });

  it('refuse une chaîne vide', () => {
    expect(isValidCameroonPhone('')).toBe(false);
  });

  it('refuse des caractères non numériques', () => {
    expect(isValidCameroonPhone('abcdefgh')).toBe(false);
    expect(isValidCameroonPhone('6123-4567')).toBe(false);
  });

  it('élague les espaces avant de valider', () => {
    expect(isValidCameroonPhone('  612345678  ')).toBe(true);
  });
});

describe('normalizePhone', () => {
  it('préfixe +237', () => {
    expect(normalizePhone('612345678')).toBe('+237612345678');
  });

  it('élague avant de préfixer', () => {
    expect(normalizePhone('  612345678  ')).toBe('+237612345678');
  });
});

describe('maskPhone', () => {
  it('masque les 3 chiffres du milieu d’un numéro E.164 valide', () => {
    expect(maskPhone('+237612345678')).toBe('+237612XXX678');
  });

  it('rend la chaîne inchangée quand le motif ne correspond pas (préfixe pays différent)', () => {
    expect(maskPhone('+33612345678')).toBe('+33612345678');
  });

  it('rend la chaîne inchangée quand la longueur ne correspond pas', () => {
    expect(maskPhone('+23761234567')).toBe('+23761234567'); // un chiffre en moins
  });

  it('rend la chaîne inchangée quand le second chiffre n’est pas 6', () => {
    expect(maskPhone('+237512345678')).toBe('+237512345678');
  });
});

describe('toLocalPhone', () => {
  it('retire le préfixe +237', () => {
    expect(toLocalPhone('+237612345678')).toBe('612345678');
  });

  it('laisse inchangée une valeur déjà locale', () => {
    expect(toLocalPhone('612345678')).toBe('612345678');
  });

  it('élague avant de retirer le préfixe', () => {
    expect(toLocalPhone('  +237612345678  ')).toBe('612345678');
  });

  it('ne retire que le préfixe en tête, pas une occurrence ailleurs', () => {
    expect(toLocalPhone('612345678+237')).toBe('612345678+237');
  });
});
