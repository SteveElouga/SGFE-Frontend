import { FcfaPipe, formatFcfa } from './fcfa.pipe';

describe('formatFcfa', () => {
  it('formats an amount with a thousands separator and the FCFA suffix', () => {
    // La locale fr-FR utilise une espace insécable comme séparateur → regex tolérante.
    expect(formatFcfa(10750)).toMatch(/^10.750.FCFA$/);
  });

  it('rounds to the nearest integer', () => {
    expect(formatFcfa(1234.6)).toMatch(/^1.235.FCFA$/);
    expect(formatFcfa(1234.4)).toMatch(/^1.234.FCFA$/);
  });

  it('treats null/undefined as 0', () => {
    expect(formatFcfa(null)).toBe('0 FCFA');
    expect(formatFcfa(undefined)).toBe('0 FCFA');
  });
});

describe('FcfaPipe', () => {
  it('delegates to formatFcfa', () => {
    expect(new FcfaPipe().transform(500)).toBe('500 FCFA');
  });
});
