import { distanceHaversineKm, dureeEstimeeMin } from './geo.utils';

describe('distanceHaversineKm', () => {
  it('vaut 0 pour deux points identiques', () => {
    expect(distanceHaversineKm({ lat: 4.05, lon: 9.7 }, { lat: 4.05, lon: 9.7 })).toBe(0);
  });

  it('mesure ~194 km à vol d’oiseau entre Douala et Yaoundé (ordre de grandeur connu)', () => {
    const douala = { lat: 4.0511, lon: 9.7679 };
    const yaounde = { lat: 3.848, lon: 11.5021 };
    const d = distanceHaversineKm(douala, yaounde);
    expect(d).toBeGreaterThan(190);
    expect(d).toBeLessThan(210);
  });

  it('est symétrique (a→b == b→a)', () => {
    const a = { lat: 4.05, lon: 9.7 };
    const b = { lat: 4.06, lon: 9.75 };
    expect(distanceHaversineKm(a, b)).toBeCloseTo(distanceHaversineKm(b, a), 10);
  });

  it('ne dépasse jamais ~1° de latitude en dessous de ~112 km', () => {
    const d = distanceHaversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('dureeEstimeeMin', () => {
  it('vaut 0 pour une distance nulle', () => {
    expect(dureeEstimeeMin(0)).toBe(0);
  });

  it('estime 60 minutes pour 30 km à 30 km/h', () => {
    expect(dureeEstimeeMin(30)).toBe(60);
  });

  it('croît linéairement avec la distance', () => {
    expect(dureeEstimeeMin(60)).toBe(2 * dureeEstimeeMin(30));
  });
});
