import { factureStatutTone } from './facture.model';

describe('factureStatutTone', () => {
  it('maps each facture status to its semantic tone', () => {
    expect(factureStatutTone('PAYEE')).toBe('success');
    expect(factureStatutTone('PARTIELLE')).toBe('info');
    expect(factureStatutTone('IMPAYEE')).toBe('danger');
  });
});
