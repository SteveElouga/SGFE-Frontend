import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
      // La vue « liste » (07) rend <app-page-topbar>, qui rend en permanence
      // <app-notification-bell> (panneau toujours dans le DOM, ouvert/fermé en
      // CSS) — son pied de panneau porte un `routerLink="/notifications"` qui
      // exige `ActivatedRoute` dans l'injecteur, même quand le panneau est fermé.
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
    ],
  });
  const fixture = TestBed.createComponent(TerrainComponent);
  return { fixture, c: fixture.componentInstance, getReleves, getRelevesParAgent, offline, query };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/**
 * Les tests ci-dessus n'appellent `detectChanges()` qu'une fois, avant la
 * résolution des promesses de chargement : le template reste donc figé sur le
 * spinner de chargement (`view()` ne bouge jamais du côté DOM même quand les
 * tests changent `view()` en appelant directement les méthodes du composant).
 * Ce helper referme la boucle : rendu initial → attente des promesses →
 * second rendu, pour obtenir le DOM une fois les données là.
 */
async function monterEtCharger(over: Parameters<typeof monter>[0] = {}) {
  const m = monter(over);
  m.fixture.detectChanges();
  await flush();
  m.fixture.detectChanges();
  return m;
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

/**
 * Le template a 3 vues (`@switch (view())` : list/saisie/success) mais les
 * tests ci-dessus ne rendent jamais que le spinner de chargement. Les blocs
 * suivants cliquent réellement dans le DOM pour faire vivre les 3 écrans.
 *
 * Aucun rendu de carte (maplibre-gl) dans ce composant : `terrain.component`
 * est l'écran agent liste/saisie/succès (07/08/09), pas la carte gestionnaire
 * (`features/carte`). Tout ce qui suit est donc du DOM Angular classique,
 * sans limite technique liée à jsdom/WebGL.
 */
describe('TerrainComponent — rendu DOM : liste (écran 07)', () => {
  it('affiche la progression et les lignes après chargement', async () => {
    const { fixture } = await monterEtCharger({
      getRelevesParAgent: vi.fn().mockResolvedValue([
        releve({ abonneId: 'a-1', statut: 'A_RELEVER' }),
        releve({ abonneId: 'a-2', statut: 'RELEVE', consommation: 12 }),
      ]),
    });
    const racine = fixture.nativeElement as HTMLElement;

    const lignes = racine.querySelectorAll('.rows .row');
    expect(lignes).toHaveLength(2);
    expect(racine.querySelector('.t-progress-row')?.textContent).toContain('50%');
    expect(lignes[0].classList.contains('row--action')).toBe(true);
    expect(lignes[1].classList.contains('row--done')).toBe(true);
  });

  it('affiche le bandeau hors-ligne quand offline.online() est faux', async () => {
    const { fixture } = await monterEtCharger({ offline: offlineStub({ online: false }) });
    expect((fixture.nativeElement as HTMLElement).querySelector('.t-offline')).toBeTruthy();
  });

  it('masque le bandeau hors-ligne quand la connexion est là', async () => {
    const { fixture } = await monterEtCharger({ offline: offlineStub({ online: true }) });
    expect((fixture.nativeElement as HTMLElement).querySelector('.t-offline')).toBeNull();
  });

  it('affiche le bandeau de synchro en attente et relance la synchro via le bouton du DOM', async () => {
    const offline = offlineStub();
    offline.pendingCount.set(2);
    const { fixture } = await monterEtCharger({ offline });
    const racine = fixture.nativeElement as HTMLElement;

    const carte = racine.querySelector('.sync-card');
    expect(carte).toBeTruthy();
    // Sans traductions chargées, `translate` rend la clé littérale (le
    // pipe ignore les paramètres d'interpolation dans ce cas) : c'est donc
    // elle qu'on vérifie, plutôt que le compte inséré par une vraie traduction.
    expect(carte?.textContent).toContain('TERRAIN.SYNC_PENDING');

    (racine.querySelector('.sync-card__retry') as HTMLButtonElement).click();
    expect(offline.retry).toHaveBeenCalledTimes(1);
  });

  it('affiche le pictogramme de synchronisation en cours quand syncing() est vrai', async () => {
    const offline = offlineStub({ syncing: true });
    offline.pendingCount.set(1);
    const { fixture } = await monterEtCharger({ offline });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.sync-card__icon i')?.classList.contains('pi-spin')).toBe(true);
  });

  it('affiche un état vide explicite sans campagne active', async () => {
    const { fixture } = await monterEtCharger({
      campagnesQuery: vi.fn().mockReturnValue(of({ data: { campagnes: [] } })),
    });
    expect((fixture.nativeElement as HTMLElement).querySelector('.t-empty')?.textContent).toContain('TERRAIN.NO_CAMPAGNE');
  });

  it('affiche un état vide quand le filtre ne retient aucune ligne, et se réinitialise via les chips du DOM', async () => {
    const { fixture } = await monterEtCharger({
      getRelevesParAgent: vi.fn().mockResolvedValue([releve({ statut: 'RELEVE' })]),
    });
    const racine = fixture.nativeElement as HTMLElement;

    const chips = racine.querySelectorAll('.fchips__chip');
    (chips[1] as HTMLButtonElement).click(); // « À relever »
    fixture.detectChanges();

    expect(racine.querySelectorAll('.rows .row')).toHaveLength(0);
    expect(racine.querySelector('.t-empty')?.textContent).toContain('TERRAIN.EMPTY');

    (chips[0] as HTMLButtonElement).click(); // « Tous »
    fixture.detectChanges();
    expect(racine.querySelectorAll('.rows .row')).toHaveLength(1);
  });

  it('affiche la bannière d’erreur et relance le chargement via le bouton Réessayer du DOM', async () => {
    const campagnesQuery = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('hors ligne')))
      .mockReturnValueOnce(of({ data: { campagnes: [campagneEnCours()] } }));
    const { fixture } = await monterEtCharger({ campagnesQuery });
    const racine = fixture.nativeElement as HTMLElement;

    expect(racine.querySelector('.error-banner')).toBeTruthy();

    (racine.querySelector('.error-banner__retry') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    expect(campagnesQuery).toHaveBeenCalledTimes(2);
    expect(racine.querySelector('.error-banner')).toBeNull();
  });

  it('une ligne déjà relevée est réellement désactivée dans le DOM (pas seulement en apparence)', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ statut: 'RELEVE' })]) });
    const racine = fixture.nativeElement as HTMLElement;

    const ligne = racine.querySelector('.rows .row') as HTMLButtonElement;
    expect(ligne.disabled).toBe(true);
    expect(ligne.classList.contains('row--action')).toBe(false);
  });

  it('affiche le pictogramme de synchronisation sur une ligne en attente (PENDING)', async () => {
    const queue: QueuedSaisie[] = [
      { id: 'q1', kind: 'INDEX', campagneId: 'camp-1', abonneId: 'a-1', abonneNom: 'Jean Dupont', nouveauIndex: 130, consommation: 30, observation: '', ts: 1, state: 'PENDING' },
    ];
    const offline = offlineStub({ queue, syncing: true });
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ abonneId: 'a-1' })]), offline });
    const racine = fixture.nativeElement as HTMLElement;

    const ligne = racine.querySelector('.rows .row') as HTMLButtonElement;
    expect(ligne.classList.contains('row--pending')).toBe(true);
    const icone = ligne.querySelector('.row__sync');
    expect(icone).toBeTruthy();
    expect(icone?.classList.contains('pi-spin')).toBe(true);
  });
});

/**
 * Gardes défensives du template : `@if (saisieEntry(); as e)` et
 * `@if (success(); as s)` protègent un état qui ne devrait jamais se
 * produire via le parcours normal de l'écran (`openSaisie`/`confirmSaisie`
 * posent toujours l'entrée avant de changer de vue). On force l'état ici
 * directement sur les signaux pour vérifier que l'écran ne casse pas et
 * n'affiche simplement rien plutôt qu'une exception `e is null`.
 */
describe('TerrainComponent — gardes défensives (état théoriquement impossible)', () => {
  it('vue « saisie » sans entrée : n’affiche pas le corps du formulaire', async () => {
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    c.view.set('saisie'); // saisieEntry() reste null : jamais posé
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.saisie-body')).toBeNull();
  });

  it('vue « succès » sans résumé : n’affiche pas l’écran de confirmation', async () => {
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    c.view.set('success'); // success() reste null : jamais posé
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.succ-head__title')).toBeNull();
  });

  it('une valeur de vue inconnue (contrat rompu) n’affiche aucun des 3 écrans', async () => {
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    // `View` est un type fermé ('list' | 'saisie' | 'success') : ce cas n'est
    // atteignable qu'en cassant le typage, pour vérifier que le `@switch` sans
    // correspondance n'affiche rien plutôt que de lever une exception.
    (c.view as unknown as { set: (v: string) => void }).set('inconnu');
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.rows')).toBeNull();
    expect(racine.querySelector('.saisie-body')).toBeNull();
    expect(racine.querySelector('.succ-head__title')).toBeNull();
  });
});

describe('TerrainComponent — rendu DOM : saisie (écran 08)', () => {
  it('clique sur une ligne « à relever » ouvre la saisie avec l’ancien index en lecture seule', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 250 })]) });
    const racine = fixture.nativeElement as HTMLElement;

    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(racine.querySelector('.saisie-body')).toBeTruthy();
    expect(racine.querySelector('.idx-box--old .idx-box__value')?.textContent).toContain('250');
  });

  it('le chevron de retour (t-back) de l’en-tête de saisie revient à la liste', async () => {
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(racine.querySelector('.saisie-body')).toBeTruthy();

    (racine.querySelector('.t-back') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(c.view()).toBe('list');
    expect(racine.querySelector('.rows')).toBeTruthy();
  });

  it('un index invalide affiche l’erreur et désactive la validation (vrai input DOM)', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();

    const champIndex = racine.querySelector('#idx-new') as HTMLInputElement;
    champIndex.value = '12abc';
    champIndex.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(racine.querySelector('.idx-box--error')).toBeTruthy();
    expect((racine.querySelector('.btn-primary') as HTMLButtonElement).disabled).toBe(true);
    expect(racine.querySelector('.conso-card')).toBeNull();
  });

  it('un index valide calcule la consommation en direct et avertit si elle est inhabituelle', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();

    const champIndex = racine.querySelector('#idx-new') as HTMLInputElement;
    champIndex.value = '700'; // 600 m³ de conso, > seuil de 500
    champIndex.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(racine.querySelector('.conso-card__value')?.textContent).toContain('600');
    expect(racine.querySelector('.conso-card__warn')).toBeTruthy();
    expect((racine.querySelector('.btn-primary') as HTMLButtonElement).disabled).toBe(false);

    const champObs = racine.querySelector('#obs-input') as HTMLTextAreaElement;
    champObs.value = 'Compteur bien visible';
    champObs.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect((fixture.componentInstance as unknown as { observation: () => string }).observation()).toBe('Compteur bien visible');
  });

  it('ouvre la feuille M-07 depuis le bouton d’exception de la saisie', async () => {
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();

    (racine.querySelector('.btn-exception') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(c.m07Visible()).toBe(true);
  });

  it('confirme un « estimé » depuis les vrais boutons de la feuille M-07 et revient à la liste', async () => {
    const offline = offlineStub();
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ abonneId: 'a-1' })]), offline });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();
    (racine.querySelector('.btn-exception') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Choix du statut « Estimé » (2e option) via un vrai clic.
    const options = racine.querySelectorAll('.m07-opt');
    (options[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    const champObsM07 = racine.querySelector('#m07-obs') as HTMLTextAreaElement;
    champObsM07.value = 'Compteur inaccessible';
    champObsM07.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonConfirmer = racine.querySelector('.btn-danger') as HTMLButtonElement;
    expect(boutonConfirmer.disabled).toBe(false);
    boutonConfirmer.click();
    fixture.detectChanges();

    expect(offline.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ESTIME', abonneId: 'a-1', observation: 'Compteur inaccessible' }),
    );
    expect(c.view()).toBe('list');
    expect(c.m07Visible()).toBe(false);
  });

  it('le bouton confirmer de la feuille M-07 reste désactivé sans observation', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();
    (racine.querySelector('.btn-exception') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((racine.querySelector('.btn-danger') as HTMLButtonElement).disabled).toBe(true);
  });

  it('annule la feuille M-07 depuis son propre bouton Annuler sans rien mettre en file', async () => {
    const offline = offlineStub();
    const { fixture, c } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve()]), offline });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();
    (racine.querySelector('.btn-exception') as HTMLButtonElement).click();
    fixture.detectChanges();

    (racine.querySelector('.btn-ghost') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(offline.enqueue).not.toHaveBeenCalled();
    expect(c.m07Visible()).toBe(false);
    expect(c.view()).toBe('saisie'); // annuler la feuille ne referme pas la saisie elle-même
  });
});

describe('TerrainComponent — rendu DOM : succès (écran 09)', () => {
  it('confirme la saisie depuis le DOM et bascule vers l’écran succès avec le résumé exact', async () => {
    const { fixture } = await monterEtCharger({
      getRelevesParAgent: vi.fn().mockResolvedValue([
        releve({ abonneId: 'a-1', ancienIndex: 100 }),
        releve({ abonneId: 'a-2', numeroAbonne: 'AB-0002' }),
      ]),
    });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();

    const champIndex = racine.querySelector('#idx-new') as HTMLInputElement;
    champIndex.value = '130';
    champIndex.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (racine.querySelector('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(racine.querySelector('.succ-head__title')).toBeTruthy();
    expect(racine.querySelector('.succ-row__conso')?.textContent).toContain('30');
    expect(racine.querySelector('.next-card')).toBeTruthy(); // a-2 reste à relever

    (racine.querySelector('.btn-success') as HTMLButtonElement).click();
    fixture.detectChanges();

    // « Relever le suivant » a rouvert directement la saisie de a-2.
    expect(racine.querySelector('.saisie-body')).toBeTruthy();
    expect(racine.querySelector('.succ-head__title')).toBeNull();
  });

  it('« Retour à la liste » depuis l’écran succès referme le résumé sans proposer de suivant', async () => {
    const { fixture } = await monterEtCharger({ getRelevesParAgent: vi.fn().mockResolvedValue([releve({ ancienIndex: 100 })]) });
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.rows .row--action') as HTMLButtonElement).click();
    fixture.detectChanges();
    const champIndex = racine.querySelector('#idx-new') as HTMLInputElement;
    champIndex.value = '130';
    champIndex.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (racine.querySelector('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(racine.querySelector('.next-card')).toBeNull(); // plus rien à relever
    expect(racine.querySelector('.btn-success')).toBeNull();

    (racine.querySelector('.btn-ghost') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(racine.querySelector('.rows')).toBeTruthy();
    expect(racine.querySelector('.succ-head__title')).toBeNull();
  });
});
