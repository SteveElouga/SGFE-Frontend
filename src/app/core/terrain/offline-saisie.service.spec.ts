import { TestBed } from '@angular/core/testing';
import { CampagnesService } from '../campagnes/campagnes.service';
import { NewSaisie, OfflineSaisieService } from './offline-saisie.service';

/**
 * File d'attente hors-ligne de l'interface terrain — le parcours le plus
 * critique de l'application (réseau instable sur le terrain, CLAUDE.md
 * « Interface Terrain — Priorité absolue mobile »). Sans ces tests, rien ne
 * garantissait qu'une saisie faite sans réseau survivait à un rechargement,
 * ni qu'un relevé rejeté par le backend n'emportait pas les suivants.
 *
 * Comme pour `apollo-persistence.spec.ts`, jsdom tel que configuré ici ne
 * fournit pas `localStorage` : on installe le même double en mémoire.
 */

const CLE_FILE = 'aquabill.terrain.queue';

function installerStockage(): Map<string, string> {
  const contenu = new Map<string, string>();
  const faux: Storage = {
    get length() { return contenu.size; },
    clear: () => contenu.clear(),
    getItem: (k: string) => (contenu.has(k) ? contenu.get(k)! : null),
    key: (i: number) => [...contenu.keys()][i] ?? null,
    removeItem: (k: string) => void contenu.delete(k),
    setItem: (k: string, v: string) => void contenu.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: faux });
  return contenu;
}

function enLigne(valeur: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: valeur });
}

/**
 * Simule la reconnexion réseau : `navigator.onLine` seul ne suffit pas, le
 * signal `online` du service n'est mis à jour que par son écouteur
 * `window.addEventListener('online', …)` — on déclenche donc l'événement réel
 * plutôt que de lire `navigator.onLine` en croyant que cela suffit. Renvoie la
 * promesse de la synchro qu'il déclenche, pour pouvoir l'attendre.
 */
function relancerEnLigne(service: OfflineSaisieService): Promise<void> {
  const syncSpy = vi.spyOn(service, 'sync');
  enLigne(true);
  window.dispatchEvent(new Event('online'));
  return syncSpy.mock.results[0]!.value as Promise<void>;
}

function saisie(overrides: Partial<NewSaisie> = {}): NewSaisie {
  return {
    kind: 'INDEX',
    campagneId: 'camp-1',
    abonneId: 'a1',
    abonneNom: 'Jean Dupont',
    nouveauIndex: 120,
    consommation: 20,
    observation: '',
    ...overrides,
  };
}

function setup(online = true) {
  const contenu = installerStockage();
  enLigne(online);

  const saisirIndexSpy = vi.fn();
  const marquerNonReleveSpy = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      {
        provide: CampagnesService,
        useValue: { saisirIndex: saisirIndexSpy, marquerNonReleve: marquerNonReleveSpy },
      },
    ],
  });

  return { service: TestBed.inject(OfflineSaisieService), saisirIndexSpy, marquerNonReleveSpy, contenu };
}

describe('OfflineSaisieService', () => {
  // ── Mise en file plutôt qu'envoi immédiat ───────────────────────────────

  it('une saisie faite hors-ligne est mise en file, pas envoyée', () => {
    const { service, saisirIndexSpy, marquerNonReleveSpy } = setup(false);

    service.enqueue(saisie());

    expect(service.queue()).toHaveLength(1);
    expect(service.queue()[0].state).toBe('PENDING');
    expect(service.pendingCount()).toBe(1);
    expect(saisirIndexSpy).not.toHaveBeenCalled();
    expect(marquerNonReleveSpy).not.toHaveBeenCalled();
  });

  it('un non-relevé/estimé hors-ligne est aussi mis en file sans être envoyé', () => {
    const { service, marquerNonReleveSpy } = setup(false);

    service.enqueue(saisie({ kind: 'NON_RELEVE', nouveauIndex: null, consommation: null }));

    expect(service.queue()).toHaveLength(1);
    expect(marquerNonReleveSpy).not.toHaveBeenCalled();
  });

  // ── Persistance à travers un rechargement ───────────────────────────────

  it('la file persiste dans localStorage et survit à un rechargement simulé', () => {
    const { service, contenu } = setup(false);
    service.enqueue(saisie({ abonneId: 'a1' }));
    // L'effect() de persistance est planifié de façon asynchrone par Angular ;
    // TestBed.tick() le flushe de façon synchrone, sans dépendre d'un composant.
    TestBed.tick();

    const brut = contenu.get(CLE_FILE);
    expect(brut).toBeTruthy();
    expect(JSON.parse(brut!)).toHaveLength(1);

    // « Rechargement » : nouvelle instance de service, même contenu de
    // localStorage (le Map sous-jacent n'est pas réinitialisé).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CampagnesService, useValue: { saisirIndex: vi.fn(), marquerNonReleve: vi.fn() } },
      ],
    });
    const relu = TestBed.inject(OfflineSaisieService);

    expect(relu.queue()).toHaveLength(1);
    expect(relu.queue()[0].abonneId).toBe('a1');
    expect(relu.queue()[0].state).toBe('PENDING');
  });

  // ── Auto-sync au retour du réseau ────────────────────────────────────────

  it('la reconnexion (événement `online`) déclenche automatiquement la synchronisation', async () => {
    const { service, saisirIndexSpy } = setup(false);
    saisirIndexSpy.mockResolvedValue({ id: 'r1' });
    service.enqueue(saisie());
    expect(saisirIndexSpy).not.toHaveBeenCalled();

    await relancerEnLigne(service);

    expect(saisirIndexSpy).toHaveBeenCalledTimes(1);
    expect(service.queue()[0].state).toBe('SYNCED');
    expect(service.pendingCount()).toBe(0);
  });

  it('constat : la synchro traite la file dans son ordre interne — le plus récemment saisi en premier', async () => {
    // `enqueue` empile en tête (`[q, ...list]`), affichage terrain oblige : le
    // dernier relevé saisi doit apparaître en haut de la liste. `sync()` ne
    // réordonne pas avant de parcourir la file, donc il traite ce même ordre
    // (le plus récent d'abord) plutôt que l'ordre chronologique de saisie.
    // Comportement verrouillé tel quel : chaque saisie est indépendante
    // (un seul relevé par abonné et par campagne), l'ordre de synchro entre
    // deux abonnés différents n'a pas de conséquence fonctionnelle connue.
    const { service, saisirIndexSpy } = setup(false);
    const ordre: string[] = [];
    saisirIndexSpy.mockImplementation(async (input: { abonneId: string }) => {
      ordre.push(input.abonneId);
      return { id: input.abonneId };
    });

    service.enqueue(saisie({ abonneId: 'premier-saisi' }));
    service.enqueue(saisie({ abonneId: 'second-saisi' }));

    await relancerEnLigne(service);

    expect(ordre).toEqual(['second-saisi', 'premier-saisi']);
  });

  // ── Résilience à un échec partiel ────────────────────────────────────────

  it('un élément rejeté par le backend est marqué en erreur sans faire perdre le reste de la file', async () => {
    const { service, saisirIndexSpy } = setup(false);
    // Traité en premier (plus récemment enqueue) → échoue.
    saisirIndexSpy
      .mockImplementationOnce(async () => {
        throw new Error('Index incohérent avec le dernier relevé connu');
      })
      // Traité ensuite → réussit.
      .mockImplementationOnce(async () => ({ id: 'ok' }));

    service.enqueue(saisie({ abonneId: 'a-ok' }));
    service.enqueue(saisie({ abonneId: 'b-echoue' }));

    await relancerEnLigne(service);

    const echoue = service.queue().find((q) => q.abonneId === 'b-echoue')!;
    const ok = service.queue().find((q) => q.abonneId === 'a-ok')!;

    expect(service.queue()).toHaveLength(2); // rien perdu
    expect(echoue.state).toBe('ERROR');
    expect(echoue.erreur).toBe('Index incohérent avec le dernier relevé connu');
    expect(ok.state).toBe('SYNCED');
    expect(service.pendingCount()).toBe(1); // seul l'échec reste à traiter
    expect(service.syncing()).toBe(false); // retombé après le cycle
  });

  it('« Réessayer » ne resynchronise que les éléments encore en attente ou en erreur', async () => {
    const { service, saisirIndexSpy } = setup(false);
    saisirIndexSpy
      .mockImplementationOnce(async () => { throw new Error('rejeté'); })
      .mockImplementationOnce(async () => ({ id: 'ok' }));
    service.enqueue(saisie({ abonneId: 'a-ok' }));
    service.enqueue(saisie({ abonneId: 'b-echoue' }));
    await relancerEnLigne(service);
    expect(saisirIndexSpy).toHaveBeenCalledTimes(2);

    saisirIndexSpy.mockResolvedValueOnce({ id: 'ok-2' });
    service.retry();
    await vi.waitFor(() => expect(service.pendingCount()).toBe(0));

    // Seul l'élément en erreur a été rejoué : pas un 3e appel pour le succès déjà acquis.
    expect(saisirIndexSpy).toHaveBeenCalledTimes(3);
    expect(service.queue().every((q) => q.state === 'SYNCED')).toBe(true);
  });

  // ── Signaux exposés à l'UI tout au long du cycle ─────────────────────────

  it('le signal `syncing` est actif pendant la synchro puis retombe', async () => {
    const { service, saisirIndexSpy } = setup(false);
    let actifPendantAppel = false;
    saisirIndexSpy.mockImplementation(async () => {
      actifPendantAppel = service.syncing();
      return { id: 'ok' };
    });
    service.enqueue(saisie());
    expect(service.syncing()).toBe(false); // hors-ligne : pas encore déclenché

    await relancerEnLigne(service);

    expect(actifPendantAppel).toBe(true);
    expect(service.syncing()).toBe(false);
  });

  it('sync() est un no-op hors-ligne, et n’avance pas la file', async () => {
    const { service, saisirIndexSpy } = setup(false);
    service.enqueue(saisie());

    await service.sync();

    expect(saisirIndexSpy).not.toHaveBeenCalled();
    expect(service.pendingCount()).toBe(1);
  });

  it('`pendingCount` reflète exactement la file au fil de son évolution', async () => {
    const { service, saisirIndexSpy } = setup(false);
    saisirIndexSpy.mockResolvedValue({ id: 'ok' });
    expect(service.pendingCount()).toBe(0);

    service.enqueue(saisie({ abonneId: 'a1' }));
    service.enqueue(saisie({ abonneId: 'a2' }));
    expect(service.pendingCount()).toBe(2);

    await relancerEnLigne(service);
    expect(service.pendingCount()).toBe(0);
    expect(service.synced()).toHaveLength(2);
  });
});
