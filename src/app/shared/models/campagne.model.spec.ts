import { campagneStatutTone, releveStatutTone } from './campagne.model';

describe('campagneStatutTone', () => {
  it('maps each campagne status to its tone', () => {
    expect(campagneStatutTone('PLANIFIEE')).toBe('info');
    expect(campagneStatutTone('EN_COURS')).toBe('info');
    expect(campagneStatutTone('CLOTUREE')).toBe('success');
  });
});

describe('releveStatutTone', () => {
  it('maps each releve status to its tone', () => {
    expect(releveStatutTone('RELEVE')).toBe('success');
    expect(releveStatutTone('ESTIME')).toBe('warning');
    expect(releveStatutTone('NON_RELEVE')).toBe('danger');
    expect(releveStatutTone('A_RELEVER')).toBe('neutral');
  });
});
