import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import {
  GET_AGENTS_CAMPAGNE,
  GET_AGENTS_DISPONIBLES,
  GET_CAMPAGNE,
  GET_CAMPAGNES,
  GET_DERNIER_INDEX,
  GET_PROGRESSION,
  GET_RELEVES,
  GET_RELEVES_PAR_AGENT,
  GET_REPARTITION_ZONE,
  GET_RESUME_CLOTURE,
  GET_ZONES_DISPONIBLES,
} from '../../graphql/queries/campagnes.queries';
import {
  AFFECTER_AGENT,
  AFFECTER_ZONES,
  AJOUTER_ABONNES_CAMPAGNE,
  CLOTURER_CAMPAGNE,
  CORRIGER_RELEVE,
  CREER_CAMPAGNE,
  DEMARRER_CAMPAGNE,
  MARQUER_NON_RELEVE,
  SAISIR_INDEX,
} from '../../graphql/mutations/campagnes.mutations';
import { CampagnesService } from './campagnes.service';

describe('CampagnesService', () => {
  function setup() {
    const querySpy = vi.fn();
    const mutateSpy = vi.fn();
    const watchQuerySpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: Apollo, useValue: { query: querySpy, mutate: mutateSpy, watchQuery: watchQuerySpy } },
      ],
    });
    return { service: TestBed.inject(CampagnesService), querySpy, mutateSpy, watchQuerySpy };
  }

  // ── watchQuery ─────────────────────────────────────────────────────────────

  it('watchCampagnes interroge en cache-and-network', () => {
    const { service, watchQuerySpy } = setup();
    const sentinel = {};
    watchQuerySpy.mockReturnValue(sentinel);
    const res = service.watchCampagnes();
    expect(watchQuerySpy).toHaveBeenCalledWith({ query: GET_CAMPAGNES, fetchPolicy: 'cache-and-network' });
    expect(res).toBe(sentinel);
  });

  it('watchCampagne transmet l’identifiant de la campagne', () => {
    const { service, watchQuerySpy } = setup();
    service.watchCampagne('c1');
    expect(watchQuerySpy).toHaveBeenCalledWith({ query: GET_CAMPAGNE, variables: { campagneId: 'c1' } });
  });

  // ── Lectures ponctuelles ─────────────────────────────────────────────────────

  it('getCampagnes rend la liste des campagnes', async () => {
    const { service, querySpy } = setup();
    const campagnes = [{ id: 'c1', nom: 'Août' }];
    querySpy.mockReturnValue(of({ data: { campagnes } }));
    const res = await service.getCampagnes();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_CAMPAGNES });
    expect(res).toBe(campagnes);
  });

  it('getCampagne interroge en network-only (statut/progression volatiles)', async () => {
    const { service, querySpy } = setup();
    const campagne = { id: 'c1', statut: 'EN_COURS' };
    querySpy.mockReturnValue(of({ data: { campagne } }));
    const res = await service.getCampagne('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_CAMPAGNE, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(campagne);
  });

  it('getCampagne propage une erreur GraphQL', async () => {
    const { service, querySpy } = setup();
    const err = new CombinedGraphQLErrors({ errors: [{ message: 'NOT_FOUND' }] } as never);
    querySpy.mockReturnValue(throwError(() => err));
    await expect(service.getCampagne('inconnue')).rejects.toBe(err);
  });

  it('getReleves rend les relevés de la campagne', async () => {
    const { service, querySpy } = setup();
    const releves = [{ id: 'r1' }];
    querySpy.mockReturnValue(of({ data: { releves } }));
    const res = await service.getReleves('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_RELEVES, variables: { campagneId: 'c1' } });
    expect(res).toBe(releves);
  });

  it('getProgression rend la progression de la campagne', async () => {
    const { service, querySpy } = setup();
    const progression = { totalAbonnes: 10, nbReleves: 4 };
    querySpy.mockReturnValue(of({ data: { progression } }));
    const res = await service.getProgression('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_PROGRESSION, variables: { campagneId: 'c1' } });
    expect(res).toBe(progression);
  });

  it('getResumeCloture interroge en network-only (ventilation autoritative)', async () => {
    const { service, querySpy } = setup();
    const resume = { nbReleves: 4 };
    querySpy.mockReturnValue(of({ data: { resumeCloture: resume } }));
    const res = await service.getResumeCloture('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_RESUME_CLOTURE, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(resume);
  });

  it('getDernierIndex rend le dernier index connu de l’abonné', async () => {
    const { service, querySpy } = setup();
    const dernierIndex = { valeur: 120 };
    querySpy.mockReturnValue(of({ data: { dernierIndex } }));
    const res = await service.getDernierIndex('a1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_DERNIER_INDEX, variables: { abonneId: 'a1' } });
    expect(res).toBe(dernierIndex);
  });

  it('getAgentsCampagne interroge en network-only', async () => {
    const { service, querySpy } = setup();
    const agents = [{ agentId: 'ag1' }];
    querySpy.mockReturnValue(of({ data: { agentsCampagne: agents } }));
    const res = await service.getAgentsCampagne('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_AGENTS_CAMPAGNE, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(agents);
  });

  it('getRepartitionZone interroge en network-only', async () => {
    const { service, querySpy } = setup();
    const repartition = [{ zone: 'Bastos' }];
    querySpy.mockReturnValue(of({ data: { repartitionParZone: repartition } }));
    const res = await service.getRepartitionZone('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_REPARTITION_ZONE, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(repartition);
  });

  it('getRelevesParAgent transmet campagne et agent', async () => {
    const { service, querySpy } = setup();
    const releves = [{ id: 'r1' }];
    querySpy.mockReturnValue(of({ data: { relevesParAgent: releves } }));
    const res = await service.getRelevesParAgent('c1', 'ag1');
    expect(querySpy).toHaveBeenCalledWith({
      query: GET_RELEVES_PAR_AGENT, variables: { campagneId: 'c1', agentId: 'ag1' }, fetchPolicy: 'network-only',
    });
    expect(res).toBe(releves);
  });

  it('getAgentsDisponibles interroge en network-only (disponibilité volatile)', async () => {
    const { service, querySpy } = setup();
    const agents = [{ agentId: 'ag1' }];
    querySpy.mockReturnValue(of({ data: { agentsDisponibles: agents } }));
    const res = await service.getAgentsDisponibles();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_AGENTS_DISPONIBLES, fetchPolicy: 'network-only' });
    expect(res).toBe(agents);
  });

  it('getZonesDisponibles interroge en network-only', async () => {
    const { service, querySpy } = setup();
    const zones = [{ quartier: 'Bastos', camp: 1 }];
    querySpy.mockReturnValue(of({ data: { zonesDisponibles: zones } }));
    const res = await service.getZonesDisponibles();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_ZONES_DISPONIBLES, fetchPolicy: 'network-only' });
    expect(res).toBe(zones);
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  it('creerCampagne transmet l’input et rend la campagne créée', async () => {
    const { service, mutateSpy } = setup();
    const campagne = { id: 'c1', nom: 'Août' };
    mutateSpy.mockReturnValue(of({ data: { creerCampagne: campagne } }));
    const input = { nom: 'Août', periodeMois: 8, periodeAnnee: 2026, datePlanifiee: '2026-08-01' };
    const res = await service.creerCampagne(input as never);
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: CREER_CAMPAGNE, variables: { input } });
    expect(res).toBe(campagne);
  });

  it('creerCampagne propage une erreur GraphQL', async () => {
    const { service, mutateSpy } = setup();
    const err = new CombinedGraphQLErrors({ errors: [{ message: 'INVALID_ARGUMENT' }] } as never);
    mutateSpy.mockReturnValue(throwError(() => err));
    await expect(service.creerCampagne({} as never)).rejects.toBe(err);
  });

  it('affecterAgent transmet campagne et agent', async () => {
    const { service, mutateSpy } = setup();
    const campagne = { id: 'c1' };
    mutateSpy.mockReturnValue(of({ data: { affecterAgent: campagne } }));
    const res = await service.affecterAgent('c1', 'ag1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: AFFECTER_AGENT, variables: { campagneId: 'c1', agentId: 'ag1' } });
    expect(res).toBe(campagne);
  });

  it('ajouterAbonnesCampagne rend le compte-rendu (dont les ignorés)', async () => {
    const { service, mutateSpy } = setup();
    const rapport = { nbAjoutes: 3, nbIgnores: 1 };
    mutateSpy.mockReturnValue(of({ data: { ajouterAbonnesCampagne: rapport } }));
    const res = await service.ajouterAbonnesCampagne('c1', ['a1', 'a2', 'a3', 'a4']);
    expect(mutateSpy).toHaveBeenCalledWith({
      mutation: AJOUTER_ABONNES_CAMPAGNE, variables: { campagneId: 'c1', abonneIds: ['a1', 'a2', 'a3', 'a4'] },
    });
    expect(res).toBe(rapport);
  });

  it('cloturerCampagne ne rend rien mais mute bien', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: { cloturerCampagne: true } }));
    await expect(service.cloturerCampagne('c1')).resolves.toBeUndefined();
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: CLOTURER_CAMPAGNE, variables: { campagneId: 'c1' } });
  });

  it('cloturerCampagne propage une erreur (ex. campagne déjà close)', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('Campagne déjà clôturée')));
    await expect(service.cloturerCampagne('c1')).rejects.toThrow('Campagne déjà clôturée');
  });

  it('demarrerCampagne rend la campagne démarrée', async () => {
    const { service, mutateSpy } = setup();
    const campagne = { id: 'c1', statut: 'EN_COURS' };
    mutateSpy.mockReturnValue(of({ data: { demarrerCampagne: campagne } }));
    const res = await service.demarrerCampagne('c1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: DEMARRER_CAMPAGNE, variables: { campagneId: 'c1' } });
    expect(res).toBe(campagne);
  });

  it('saisirIndex transmet l’input tel quel', async () => {
    const { service, mutateSpy } = setup();
    const releve = { id: 'r1', consommation: 20 };
    mutateSpy.mockReturnValue(of({ data: { saisirIndex: releve } }));
    const input = { campagneId: 'c1', abonneId: 'a1', nouvelIndex: 120 };
    const res = await service.saisirIndex(input as never);
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: SAISIR_INDEX, variables: { input } });
    expect(res).toBe(releve);
  });

  it('saisirIndex propage une erreur (ex. index incohérent)', async () => {
    const { service, mutateSpy } = setup();
    const err = new CombinedGraphQLErrors({ errors: [{ message: 'Index inférieur au précédent' }] } as never);
    mutateSpy.mockReturnValue(throwError(() => err));
    await expect(service.saisirIndex({} as never)).rejects.toBe(err);
  });

  it('marquerNonReleve transmet l’input', async () => {
    const { service, mutateSpy } = setup();
    const releve = { id: 'r1', statut: 'NON_RELEVE' };
    mutateSpy.mockReturnValue(of({ data: { marquerNonReleve: releve } }));
    const input = { campagneId: 'c1', abonneId: 'a1', motif: 'Absent' };
    const res = await service.marquerNonReleve(input as never);
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: MARQUER_NON_RELEVE, variables: { input } });
    expect(res).toBe(releve);
  });

  it('corrigerReleve transmet l’input', async () => {
    const { service, mutateSpy } = setup();
    const releve = { id: 'r1', consommation: 25 };
    mutateSpy.mockReturnValue(of({ data: { corrigerReleve: releve } }));
    const input = { releveId: 'r1', nouvelIndex: 125 };
    const res = await service.corrigerReleve(input as never);
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: CORRIGER_RELEVE, variables: { input } });
    expect(res).toBe(releve);
  });

  it('affecterZones transmet campagne, agent et zones', async () => {
    const { service, mutateSpy } = setup();
    const zones = [{ quartier: 'Bastos', camp: 1 }];
    mutateSpy.mockReturnValue(of({ data: { affecterZones: zones } }));
    const res = await service.affecterZones('c1', 'ag1', zones as never);
    expect(mutateSpy).toHaveBeenCalledWith({
      mutation: AFFECTER_ZONES, variables: { campagneId: 'c1', agentId: 'ag1', zones },
    });
    expect(res).toBe(zones);
  });
});
