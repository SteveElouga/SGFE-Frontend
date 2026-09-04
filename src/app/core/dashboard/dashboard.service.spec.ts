import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { GET_STATS_GLOBALES, GET_STATS_PAR_MOIS } from '../../graphql/queries/stats.queries';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';
import { CampagnesService } from '../campagnes/campagnes.service';
import { FacturesService } from '../factures/factures.service';
import { DashboardService, StatsMois } from './dashboard.service';

describe('DashboardService', () => {
  function setup() {
    const querySpy = vi.fn();
    const facturesService = {
      getImpayes: vi.fn().mockResolvedValue([]),
      getAllPaiements: vi.fn().mockResolvedValue([]),
      getFactures: vi.fn().mockResolvedValue([]),
      getAllEnvois: vi.fn().mockResolvedValue([]),
    };
    const campagnesService = {
      getAgentsCampagne: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Apollo, useValue: { query: querySpy } },
        { provide: FacturesService, useValue: facturesService },
        { provide: CampagnesService, useValue: campagnesService },
      ],
    });
    // Réponses par défaut, neutres, pour ne pas faire échouer loadAll() dans
    // les tests qui ne s'y intéressent pas directement.
    querySpy.mockImplementation(({ query }) => {
      if (query === GET_STATS_GLOBALES) return of({ data: { statsGlobales: null } });
      if (query === GET_STATS_PAR_MOIS) return of({ data: { statsParMois: null } });
      if (query === GET_CAMPAGNES) return of({ data: { campagnes: null } });
      return of({ data: null });
    });
    return { service: TestBed.inject(DashboardService), querySpy, facturesService, campagnesService };
  }

  // ── loadAgentsByCampagne ─────────────────────────────────────────────────────

  describe('loadAgentsByCampagne', () => {
    it('rend une Map vide sans appel réseau pour une liste vide', async () => {
      const { service, campagnesService } = setup();
      const res = await service.loadAgentsByCampagne([]);
      expect(res.size).toBe(0);
      expect(campagnesService.getAgentsCampagne).not.toHaveBeenCalled();
    });

    it('charge les agents de chaque campagne en parallèle', async () => {
      const { service, campagnesService } = setup();
      campagnesService.getAgentsCampagne.mockImplementation(async (id: string) => [{ agentId: `ag-${id}` }]);

      const res = await service.loadAgentsByCampagne(['c1', 'c2']);

      expect(res.get('c1')).toEqual([{ agentId: 'ag-c1' }]);
      expect(res.get('c2')).toEqual([{ agentId: 'ag-c2' }]);
    });

    it('une campagne dont le chargement échoue est absente de la Map, sans faire échouer les autres', async () => {
      const { service, campagnesService } = setup();
      campagnesService.getAgentsCampagne.mockImplementation(async (id: string) => {
        if (id === 'c-en-echec') throw new Error('PERMISSION_DENIED');
        return [{ agentId: `ag-${id}` }];
      });

      const res = await service.loadAgentsByCampagne(['c-ok', 'c-en-echec']);

      expect(res.has('c-en-echec')).toBe(false);
      expect(res.get('c-ok')).toEqual([{ agentId: 'ag-c-ok' }]);
    });
  });

  // ── loadAll ──────────────────────────────────────────────────────────────────

  describe('loadAll', () => {
    it('interroge les trois sources GraphQL en silentError, network-only', async () => {
      const { service, querySpy } = setup();
      await service.loadAll();

      expect(querySpy).toHaveBeenCalledWith({
        query: GET_STATS_GLOBALES, fetchPolicy: 'network-only', context: { silentError: true },
      });
      expect(querySpy).toHaveBeenCalledWith({
        query: GET_STATS_PAR_MOIS, variables: { nbMois: 12 }, fetchPolicy: 'network-only', context: { silentError: true },
      });
      expect(querySpy).toHaveBeenCalledWith({
        query: GET_CAMPAGNES, fetchPolicy: 'network-only', context: { silentError: true },
      });
    });

    it('interroge les quatre sources REST (via FacturesService)', async () => {
      const { service, facturesService } = setup();
      await service.loadAll();
      expect(facturesService.getImpayes).toHaveBeenCalledTimes(1);
      expect(facturesService.getAllPaiements).toHaveBeenCalledTimes(1);
      expect(facturesService.getFactures).toHaveBeenCalledTimes(1);
      expect(facturesService.getAllEnvois).toHaveBeenCalledTimes(1);
    });

    it('compose le résultat avec les données reçues', async () => {
      const { service, querySpy, facturesService } = setup();
      querySpy.mockImplementation(({ query }) => {
        if (query === GET_STATS_GLOBALES) return of({ data: { statsGlobales: { consommationTotaleGlobale: 100 } } });
        if (query === GET_STATS_PAR_MOIS) return of({ data: { statsParMois: [] } });
        if (query === GET_CAMPAGNES) return of({ data: { campagnes: [{ id: 'c1' }] } });
        return of({ data: null });
      });
      facturesService.getImpayes.mockResolvedValue([{ factureId: 'f1' }]);

      const res = await service.loadAll();

      expect(res.stats).toEqual({ consommationTotaleGlobale: 100 });
      expect(res.campagnes).toEqual([{ id: 'c1' }]);
      expect(res.impayes).toEqual([{ factureId: 'f1' }]);
    });

    it('une source qui échoue rend null sans faire tomber les autres', async () => {
      const { service, querySpy, facturesService } = setup();
      querySpy.mockImplementation(({ query }) => {
        if (query === GET_STATS_GLOBALES) return throwError(() => new Error('SERVICE_UNAVAILABLE'));
        if (query === GET_STATS_PAR_MOIS) return of({ data: { statsParMois: null } });
        if (query === GET_CAMPAGNES) return of({ data: { campagnes: [{ id: 'c1' }] } });
        return of({ data: null });
      });
      facturesService.getAllPaiements.mockRejectedValue(new Error('PERMISSION_DENIED'));

      const res = await service.loadAll();

      expect(res.stats).toBeNull();
      expect(res.paiements).toBeNull();
      expect(res.campagnes).toEqual([{ id: 'c1' }]);
    });

    it('sert le cache pour un second appel dans les 30s', async () => {
      const { service, querySpy } = setup();
      await service.loadAll();
      await service.loadAll();
      expect(querySpy).toHaveBeenCalledTimes(3); // stats, statsParMois, campagnes — pas 6
    });

    it('invalidate() force un rechargement complet', async () => {
      const { service, querySpy } = setup();
      await service.loadAll();
      service.invalidate();
      await service.loadAll();
      expect(querySpy).toHaveBeenCalledTimes(6);
    });

    it('re-fetch après expiration du TTL de 30s', async () => {
      vi.useFakeTimers();
      const { service, querySpy } = setup();
      await service.loadAll();
      vi.advanceTimersByTime(30_001);
      await service.loadAll();
      expect(querySpy).toHaveBeenCalledTimes(6);
      vi.useRealTimers();
    });
  });

  // ── reloadSource ─────────────────────────────────────────────────────────────

  describe('reloadSource', () => {
    it('ne recharge que la source demandée, conserve les autres du cache existant', async () => {
      const { service, querySpy, facturesService } = setup();
      querySpy.mockImplementation(({ query }) => {
        if (query === GET_CAMPAGNES) return of({ data: { campagnes: [{ id: 'c1' }] } });
        return of({ data: null });
      });
      await service.loadAll();
      querySpy.mockClear();
      facturesService.getImpayes.mockClear();
      facturesService.getImpayes.mockResolvedValue([{ factureId: 'nouveau' }]);

      const res = await service.reloadSource('impayes');

      expect(facturesService.getImpayes).toHaveBeenCalledTimes(1);
      expect(querySpy).not.toHaveBeenCalled(); // campagnes pas re-sollicitée
      expect(res.campagnes).toEqual([{ id: 'c1' }]); // conservée du cache précédent
      expect(res.impayes).toEqual([{ factureId: 'nouveau' }]);
    });

    it('part de valeurs neutres quand aucun cache n’existe encore', async () => {
      const { service, facturesService } = setup();
      facturesService.getAllPaiements.mockResolvedValue([{ paiementId: 'p1' }]);

      const res = await service.reloadSource('paiements');

      expect(res.paiements).toEqual([{ paiementId: 'p1' }]);
      expect(res.stats).toBeNull();
      expect(res.campagnes).toBeNull();
    });

    it('couvre chacune des sept sources', async () => {
      const { service, querySpy, facturesService } = setup();
      const sources: Array<Parameters<DashboardService['reloadSource']>[0]> = [
        'stats', 'statsParMois', 'campagnes', 'impayes', 'paiements', 'factures', 'envois',
      ];
      for (const s of sources) {
        querySpy.mockClear();
        Object.values(facturesService).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear());
        await expect(service.reloadSource(s)).resolves.toBeDefined();
      }
    });
  });

  // ── computeDelta ─────────────────────────────────────────────────────────────

  describe('computeDelta', () => {
    it('calcule le pourcentage de variation vs le mois précédent', () => {
      const { service } = setup();
      const parMois: StatsMois[] = [
        { mois: '2026-08', annee: 2026, moisNum: 8, encaisse: 150, facture: 0, consommation: 0, nbPaiements: 0, nbFactures: 0 },
        { mois: '2026-07', annee: 2026, moisNum: 7, encaisse: 100, facture: 0, consommation: 0, nbPaiements: 0, nbFactures: 0 },
      ];
      const delta = service.computeDelta(parMois, 'encaisse');
      expect(delta).toEqual({ value: 150, previous: 100, deltaPct: 50 });
    });

    it('deltaPct est null quand le mois précédent vaut 0 (division impossible)', () => {
      const { service } = setup();
      const parMois: StatsMois[] = [
        { mois: '2026-08', annee: 2026, moisNum: 8, encaisse: 0, facture: 100, consommation: 0, nbPaiements: 0, nbFactures: 0 },
        { mois: '2026-07', annee: 2026, moisNum: 7, encaisse: 0, facture: 0, consommation: 0, nbPaiements: 0, nbFactures: 0 },
      ];
      const delta = service.computeDelta(parMois, 'facture');
      expect(delta).toEqual({ value: 100, previous: 0, deltaPct: null });
    });

    it('deltaPct et previous sont null au premier mois de suivi (un seul élément)', () => {
      const { service } = setup();
      const parMois: StatsMois[] = [
        { mois: '2026-08', annee: 2026, moisNum: 8, encaisse: 0, facture: 0, consommation: 40, nbPaiements: 0, nbFactures: 0 },
      ];
      expect(service.computeDelta(parMois, 'consommation')).toEqual({ value: 40, previous: null, deltaPct: null });
    });

    it('rend des valeurs neutres pour une liste vide', () => {
      const { service } = setup();
      expect(service.computeDelta([], 'encaisse')).toEqual({ value: 0, previous: null, deltaPct: null });
    });

    it('rend des valeurs neutres pour null (source non chargée)', () => {
      const { service } = setup();
      expect(service.computeDelta(null, 'encaisse')).toEqual({ value: 0, previous: null, deltaPct: null });
    });
  });
});
