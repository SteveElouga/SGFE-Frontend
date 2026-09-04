import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { TerrainComponent } from './terrain.component';
import { CampagnesService } from '../../core/campagnes/campagnes.service';
import { AuthService } from '../../core/auth/auth.service';
import { OfflineSaisieService, QueuedSaisie } from '../../core/terrain/offline-saisie.service';
import { ToastService } from '../../shared/services/toast.service';
import type { ReleveLigne } from '../../graphql/vues';

/**
 * Interface agent terrain — parcours le plus critique de l'application
 * (CLAUDE.md « Interface Terrain — Priorité absolue mobile ») : liste des
 * relevés, saisie en 3 taps maximum, clavier numérique, et file hors-ligne.
 *
 * `OfflineSaisieService` est mocké entièrement ici (son propre contrat est
 * couvert par `offline-saisie.service.spec.ts`) : ces tests portent sur la
 * façon dont l'écran l'utilise — surcharge de la liste serveur par la file
 * locale, payload exact envoyé à `enqueue()`, et validation du clavier
 * numérique avant tout envoi.
 */
function releve(p: Partial<ReleveLigne> = {}): ReleveLigne {
  return {
    releveId: 'r-1',
    abonneId: 'a-1',
    ancienIndex: 100,
    nouveauIndex: 0,
    consommation: 0,
    statut: 'A_RELEVER',
    observation: '',
    dateReleve: '',
    abonneNom: 'Dupont',
    abonnePrenom: 'Jean',
    numeroAbonne: 'AB-0001',
    numeroCompteur: 12,
    quartier: 'Bonamoussadi',
    camp: 1,
    ...p,
  } as ReleveLigne;
}

function campagneEnCours(p: Partial<{ campagneId: string; statut: string }> = {}) {
  return {
    campagneId: 'camp-1',
    nom: 'Août 2026',
    periodeMois: 8,
    periodeAnnee: 2026,
    statut: 'EN_COURS',
    datePlanifiee: '',
    dateCreation: '',
    dateCloture: '',
    createdBy: '',
    numeroMobileMoney: '',
    genererFacturesAuto: false,
    envoyerWhatsappAuto: false,
    ...p,
  };
}

function offlineStub(over: Partial<{
  online: boolean;
  queue: QueuedSaisie[];
  syncing: boolean;
}> = {}) {
  return {
    online: signal(over.online ?? true),
    queue: signal<QueuedSaisie[]>(over.queue ?? []),
    syncing: signal(over.syncing ?? false),
    pendingCount: signal(0),
    synced: signal([]),
    enqueue: vi.fn(),
    sync: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn(),
    clearSynced: vi.fn(),
    submittedAbonneIds: vi.fn().mockReturnValue(new Set()),
  };
}

function monter(over: {
  campagnesQuery?: ReturnType<typeof vi.fn>;
  getReleves?: ReturnType<typeof vi.fn>;
  getRelevesParAgent?: ReturnType<typeof vi.fn>;
  role?: 'ADMIN' | 'AGENT';
  offline?: ReturnType<typeof offlineStub>;
} = {}) {
  const query = over.campagnesQuery ?? vi.fn().mockReturnValue(of({ data: { campagnes: [campagneEnCours()] } }));
  const getReleves = over.getReleves ?? vi.fn().mockResolvedValue([releve()]);
  const getRelevesParAgent = over.getRelevesParAgent ?? vi.fn().mockResolvedValue([releve()]);
  const offline = over.offline ?? offlineStub();

  TestBed.configureTestingModule({
    imports: [TerrainComponent],
    providers: [
      provideTranslateService({}),
      { provide: Apollo, useValue: { query, subscribe: () => of({}) } },
      { provide: CampagnesService, useValue: { getReleves, getRelevesParAgent } },
      { provide: AuthService, useValue: { user: signal({ id: 'agent-1', username: 'kamga', role: over.role ?? 'AGENT' }) } },
      { provide: OfflineSaisieService, useValue: offline },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(TerrainComponent);
  return { fixture, c: fixture.componentInstance, getReleves, getRelevesParAgent, offline, query };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('TerrainComponent — chargement de la campagne active', () => {
  it('ne retient que la campagne EN_COURS, jamais une PLANIFIEE ou CLOTUREE', async () => {
    const { fixture, c } = monter({
      campagnesQuery: vi.fn().mockReturnValue(
        of({ data: { campagnes: [campagneEnCours({ campagneId: 'planifiee', statut: 'PLANIFIEE' }), campagneEnCours({ campagneId: 'active' })] } }),
      ),
    });
    fixture.detectChanges();
    await flush();
    expect(c.campagne()?.campagneId).toBe('active');
  });

  it('sans campagne active, affiche un état vide explicite plutôt qu’une campagne non saisissable', async () => {
    const { fixture, c, getReleves } = monter({
      campagnesQuery: vi.fn().mockReturnValue(of({ data: { campagnes: [campagneEnCours({ statut: 'CLOTUREE' })] } })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.campagne()).toBeNull();
    expect(c.releves()).toHaveLength(0);
    expect(getReleves).not.toHaveBeenCalled();
  });

  it('un AGENT ne voit que sa tournée', async () => {
    const { fixture, getRelevesParAgent, getReleves } = monter({ role: 'AGENT' });
    fixture.detectChanges();
    await flush();
    expect(getRelevesParAgent).toHaveBeenCalledWith('camp-1', 'agent-1');
    expect(getReleves).not.toHaveBeenCalled();
  });

  it('un ADMIN voit la campagne entière', async () => {
    const { fixture, getReleves, getRelevesParAgent } = monter({ role: 'ADMIN' });
    fixture.detectChanges();
    await flush();
    expect(getReleves).toHaveBeenCalledWith('camp-1');
    expect(getRelevesParAgent).not.toHaveBeenCalled();
  });

  it('purge les saisies déjà synchronisées une fois les relevés serveur rechargés', async () => {
    const offline = offlineStub();
    const { fixture } = monter({ offline });
    fixture.detectChanges();
    await flush();
    expect(offline.clearSynced).toHaveBeenCalledTimes(1);
  });

  it('affiche une erreur explicite en cas d’échec réseau', async () => {
    const { fixture, c } = monter({ campagnesQuery: vi.fn().mockReturnValue(throwError(() => new Error('hors ligne'))) });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeTruthy();
    expect(c.loading()).toBe(false);
  });
});

describe('TerrainComponent — liste unifiée (serveur + file locale)', () => {
  it('un relevé sans saisie locale reflète son statut serveur', async () => {
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ statut: 'A_RELEVER' })]) });
    fixture.detectChanges();
    await flush();
    expect(c.entries()[0].status).toBe('A_RELEVER');
  });

  it('une saisie en attente masque le statut serveur avec « PENDING »', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'PENDING' },
    ];
    const { fixture, c } = monter({ offline: offlineStub({ queue }) });
    fixture.detectChanges();
    await flush();
    expect(c.entries()[0].status).toBe('PENDING');
  });

  it('un item en erreur de synchro s’affiche aussi en attente (pas perdu)', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'ERROR', erreur: 'rejeté' },
    ];
    const { fixture, c } = monter({ offline: offlineStub({ queue }) });
    fixture.detectChanges();
    await flush();
    expect(c.entries()[0].status).toBe('PENDING');
  });

  it('une saisie synchronisée passe en « RELEVE » jusqu’au prochain rechargement serveur', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'SYNCED' },
    ];
    const { fixture, c } = monter({ offline: offlineStub({ queue }) });
    fixture.detectChanges();
    await flush();
    expect(c.entries()[0].status).toBe('RELEVE');
  });

  it('le plus récent de la file fait foi pour un même abonné (plusieurs saisies)', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q2', kind: 'ESTIME', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: null, consommation: null, observation: '', ts: 2, state: 'PENDING' },
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'SYNCED' },
    ];
    const { fixture, c } = monter({ offline: offlineStub({ queue }) });
    fixture.detectChanges();
    await flush();
    // Le premier élément de la file (le plus récent, `enqueue` empile en tête) l'emporte.
    expect(c.entries()[0].status).toBe('PENDING');
  });

  it('replie sur l’id de l’abonné quand son identité n’est pas jointe (Abonné Service down)', async () => {
    const { fixture, c } = monter({
      getRelevesParAgent: vi.fn().mockResolvedValue([releve({ abonneNom: '', abonnePrenom: '' })]),
    });
    fixture.detectChanges();
    await flush();
    expect(c.entries()[0].nom).toBe('a-1');
  });

  it('countReleve compte aussi les PENDING (déjà « faits » du point de vue de l’agent)', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'PENDING' },
    ];
    const { fixture, c } = monter({ offline: offlineStub({ queue }) });
    fixture.detectChanges();
    await flush();
    expect(c.countReleve()).toBe(1);
    expect(c.countARelever()).toBe(0);
    expect(c.progressPct()).toBe(100);
  });
});

describe('TerrainComponent — filtres', () => {
  it('filtre A_RELEVER / RELEVE', async () => {
    const { fixture, c } = monter({
      getRelevesParAgent: vi.fn().mockResolvedValue([
        releve({ abonneId: 'a-1', statut: 'A_RELEVER' }),
        releve({ abonneId: 'a-2', statut: 'RELEVE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    c.setFiltre('A_RELEVER');
    expect(c.filteredEntries().map((e) => e.abonneId)).toEqual(['a-1']);
    c.setFiltre('RELEVE');
    expect(c.filteredEntries().map((e) => e.abonneId)).toEqual(['a-2']);
  });

  it('onFilterChange(null) revient à « TOUS »', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.setFiltre('A_RELEVER');
    c.onFilterChange(null);
    expect(c.filtre()).toBe('TOUS');
  });
});

describe('TerrainComponent — validation du clavier numérique (RV-001)', () => {
  function preparerSaisie(ancienIndex = 100) {
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex })]) });
    fixture.detectChanges();
    return { fixture, c };
  }

  it('ouvre la saisie seulement pour un abonné A_RELEVER (max 3 taps)', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    const dejaReleve = { ...c.entries()[0], status: 'RELEVE' as const };
    c.openSaisie(dejaReleve);
    expect(c.view()).toBe('list'); // ne s'ouvre pas
    c.openSaisie(c.entries()[0]);
    expect(c.view()).toBe('saisie');
  });

  it('rejette un index non numérique ("12abc")', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('12abc');
    expect(c.indexInvalide()).toBe(true);
    expect(c.saisieValide()).toBe(false);
    expect(c.consoLive()).toBeNull();
  });

  it('rejette un nombre décimal ("120.5")', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('120.5');
    expect(c.indexInvalide()).toBe(true);
  });

  it('rejette un index négatif', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('-5');
    expect(c.indexInvalide()).toBe(true);
  });

  it('rejette un index inférieur au dernier relevé', async () => {
    const { fixture, c } = preparerSaisie(100);
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('99');
    expect(c.indexInvalide()).toBe(true);
    expect(c.saisieValide()).toBe(false);
  });

  it('rejette un index dépassant le plafond dur', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('100000000');
    expect(c.indexInvalide()).toBe(true);
  });

  it('accepte un index valide et calcule la consommation en direct', async () => {
    const { fixture, c } = preparerSaisie(100);
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    expect(c.indexInvalide()).toBe(false);
    expect(c.saisieValide()).toBe(true);
    expect(c.consoLive()).toBe(30);
  });

  it('un champ vide n’est pas signalé invalide (rien saisi pour l’instant)', async () => {
    const { fixture, c } = preparerSaisie();
    await flush();
    c.openSaisie(c.entries()[0]);
    expect(c.indexInvalide()).toBe(false);
    expect(c.saisieValide()).toBe(false); // vide n'est pas valide non plus
  });

  it('avertit sur une consommation inhabituelle sans bloquer la validation', async () => {
    const { fixture, c } = preparerSaisie(100);
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('700'); // 600 m³ de conso, > 500
    expect(c.consoWarn()).toBe(true);
    expect(c.saisieValide()).toBe(true);
  });
});

describe('TerrainComponent — confirmation de la saisie (3e tap)', () => {
  it('met en file la saisie avec le payload exact attendu', async () => {
    const offline = offlineStub();
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]), offline });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.observation.set('  RAS  ');
    c.confirmSaisie();

    expect(offline.enqueue).toHaveBeenCalledWith({
      kind: 'INDEX',
      campagneId: 'camp-1',
      abonneId: 'a-1',
      abonneNom: 'Jean Dupont',
      nouveauIndex: 130,
      consommation: 30,
      observation: 'RAS',
    });
  });

  it('bascule vers l’écran de succès avec le résumé exact', async () => {
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]) });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.confirmSaisie();

    expect(c.view()).toBe('success');
    expect(c.success()).toEqual(
      expect.objectContaining({ abonneId: 'a-1', ancienIndex: 100, nouvelIndex: 130, conso: 30 }),
    );
  });

  it('refuse de confirmer une saisie invalide', async () => {
    const offline = offlineStub();
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]), offline });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('50'); // sous l'ancien index
    c.confirmSaisie();

    expect(offline.enqueue).not.toHaveBeenCalled();
    expect(c.view()).toBe('saisie');
  });

  it('propose le prochain abonné A_RELEVER, jamais l’abonné qu’on vient de saisir', async () => {
    const { fixture, c } = monter({
      getRelevesParAgent: vi.fn().mockResolvedValue([
        releve({ abonneId: 'a-1', numeroAbonne: 'AB-0001' }),
        releve({ abonneId: 'a-2', numeroAbonne: 'AB-0002' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]); // a-1
    c.nouvelIndex.set('130');
    c.confirmSaisie();

    expect(c.prochain()?.abonneId).toBe('a-2');
  });

  it('« Relever le suivant » ouvre directement la saisie du prochain', async () => {
    const { fixture, c } = monter({
      getRelevesParAgent: vi.fn().mockResolvedValue([
        releve({ abonneId: 'a-1', numeroAbonne: 'AB-0001' }),
        releve({ abonneId: 'a-2', numeroAbonne: 'AB-0002' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.confirmSaisie();

    c.releverSuivant();
    expect(c.view()).toBe('saisie');
    expect(c.saisieEntry()?.abonneId).toBe('a-2');
  });

  it('« Relever le suivant » revient à la liste si plus rien à faire', async () => {
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ abonneId: 'a-1' })]) });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.confirmSaisie();

    c.releverSuivant();
    expect(c.view()).toBe('list');
  });

  it('backToList referme aussi la feuille M-07 en vol', async () => {
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.openM07();
    c.backToList();
    expect(c.view()).toBe('list');
    expect(c.m07Visible()).toBe(false);
    expect(c.saisieEntry()).toBeNull();
  });
});

describe('TerrainComponent — feuille M-07 (non relevé / estimé)', () => {
  it('met en file un « non relevé » avec observation, sans index ni conso', async () => {
    const offline = offlineStub();
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]), offline });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.onM07Confirm({ statut: 'NON_RELEVE', observation: 'Portail fermé' });

    expect(offline.enqueue).toHaveBeenCalledWith({
      kind: 'NON_RELEVE',
      campagneId: 'camp-1',
      abonneId: 'a-1',
      abonneNom: 'Jean Dupont',
      nouveauIndex: null,
      consommation: null,
      observation: 'Portail fermé',
    });
    expect(c.view()).toBe('list');
    expect(c.m07Visible()).toBe(false);
  });

  it('met en file un « estimé »', async () => {
    const offline = offlineStub();
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]), offline });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.onM07Confirm({ statut: 'ESTIME', observation: 'Compteur inaccessible' });

    expect(offline.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ESTIME' }));
  });

  it('cancelM07 referme la feuille sans rien mettre en file', async () => {
    const offline = offlineStub();
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]), offline });
    fixture.detectChanges();
    await flush();
    c.openSaisie(c.entries()[0]);
    c.openM07();
    c.cancelM07();
    expect(c.m07Visible()).toBe(false);
    expect(offline.enqueue).not.toHaveBeenCalled();
  });
});

describe('TerrainComponent — message de confirmation, en ligne ou hors-ligne', () => {
  it('remercie différemment selon la connectivité au moment de l’enregistrement', async () => {
    const offline = offlineStub({ online: false });
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]), offline });
    fixture.detectChanges();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.confirmSaisie();
    expect(toast.success).toHaveBeenCalledWith('TERRAIN.TOAST_SAVED_OFFLINE', 'Jean Dupont');
  });

  it('message « en ligne » quand le réseau est disponible', async () => {
    const offline = offlineStub({ online: true });
    const { fixture, c } = monter({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]), offline });
    fixture.detectChanges();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
    c.openSaisie(c.entries()[0]);
    c.nouvelIndex.set('130');
    c.confirmSaisie();
    expect(toast.success).toHaveBeenCalledWith('TERRAIN.TOAST_SAVED', 'Jean Dupont');
  });
});

describe('TerrainComponent — formatage', () => {
  it('formate l’heure en français avec un « h » (09h05)', async () => {
    const { c } = monter();
    const translate = TestBed.inject(TranslateService);
    translate.use('fr');
    const ts = new Date(2026, 0, 1, 9, 5).getTime();
    expect(c.formatTime(ts)).toMatch(/^09h05$/);
  });

  it('agentNom reflète l’utilisateur connecté', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    expect(c.agentNom()).toBe('kamga');
  });
});
