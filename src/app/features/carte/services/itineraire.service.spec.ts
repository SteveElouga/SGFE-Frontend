import { TestBed } from '@angular/core/testing';
import { ItineraireService } from './itineraire.service';

const ORIGINE = { lat: 4.0511, lon: 9.7679 };
const DESTINATION = { lat: 4.06, lon: 9.75 };

describe('ItineraireService', () => {
  let service: ItineraireService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ItineraireService);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('utilise la réponse OSRM quand elle réussit (estimation: false)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            distance: 5000,
            duration: 600,
            geometry: { coordinates: [[9.7679, 4.0511], [9.75, 4.06]] },
          },
        ],
      }),
    });

    const resultat = await service.calculer(ORIGINE, DESTINATION);

    expect(resultat.estimation).toBe(false);
    expect(resultat.distanceKm).toBe(5);
    expect(resultat.dureeMin).toBe(10);
    expect(resultat.geometrie).toEqual([[9.7679, 4.0511], [9.75, 4.06]]);
  });

  it('retombe sur Haversine si OSRM répond en erreur HTTP', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const resultat = await service.calculer(ORIGINE, DESTINATION);

    expect(resultat.estimation).toBe(true);
    expect(resultat.distanceKm).toBeGreaterThan(0);
    expect(resultat.geometrie).toEqual([
      [ORIGINE.lon, ORIGINE.lat],
      [DESTINATION.lon, DESTINATION.lat],
    ]);
  });

  it('retombe sur Haversine si OSRM ne renvoie aucune route', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) });

    const resultat = await service.calculer(ORIGINE, DESTINATION);

    expect(resultat.estimation).toBe(true);
  });

  it('retombe sur Haversine si l’appel réseau rejette (timeout/déconnexion)', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));

    const resultat = await service.calculer(ORIGINE, DESTINATION);

    expect(resultat.estimation).toBe(true);
    expect(resultat.dureeMin).toBeGreaterThan(0);
  });
});
