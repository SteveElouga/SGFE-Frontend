import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AgentsSheetComponent } from './agents-sheet.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';

/**
 * Affecter des agents à une campagne. Le backend n'expose que l'ajout : les
 * agents déjà affectés sont affichés cochés et VERROUILLÉS — le garde-fou
 * important ici est que le retrait n'existe pas côté UI, et que seules les
 * nouvelles coches partent en mutation (une par agent, `affecterAgent`).
 */
function agent(id: string, username: string, isActive = true, phoneNumber = '077000000') {
  return { id, username, phoneNumber, isActive };
}

describe('AgentsSheetComponent', () => {
  let affecterAgent: ReturnType<typeof vi.fn>;
  let getAgentsDisponibles: ReturnType<typeof vi.fn>;
  let succes: ReturnType<typeof vi.fn>;
  let erreurToast: ReturnType<typeof vi.fn>;

  function creer(agents = [agent('u2', 'Béatrice'), agent('u1', 'Amadou'), agent('u3', 'Chantal', false)]) {
    affecterAgent = vi.fn().mockResolvedValue({ agentId: 'u1', username: 'Amadou' });
    getAgentsDisponibles = vi.fn().mockResolvedValue(agents);
    succes = vi.fn();
    erreurToast = vi.fn();

    TestBed.configureTestingModule({
      imports: [AgentsSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { affecterAgent, getAgentsDisponibles } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });

    const fixture = TestBed.createComponent(AgentsSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('assignedUsernames', []);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  }

  // L'ouverture déclenche le chargement via `effect` + `queueMicrotask`.
  async function ouvrir(over: { agents?: ReturnType<typeof agent>[]; assigned?: string[] } = {}) {
    const f = creer(over.agents);
    if (over.assigned) f.componentRef.setInput('assignedUsernames', over.assigned);
    await Promise.resolve();
    await Promise.resolve();
    f.detectChanges();
    return f;
  }

  it('trie les agents par nom (ordre français) à l’ouverture', async () => {
    const f = await ouvrir();
    expect(f.componentInstance.filtered().map((a) => a.username)).toEqual(['Amadou', 'Béatrice', 'Chantal']);
  });

  it('pré-coche et verrouille les agents déjà affectés (par username)', async () => {
    const f = await ouvrir({ assigned: ['Amadou'] });
    const c = f.componentInstance;
    const amadou = c.filtered().find((a) => a.username === 'Amadou')!;
    expect(c.isSelected(amadou)).toBe(true);
    expect(c.isLocked(amadou)).toBe(true);
  });

  it('un clic sur un agent déjà affecté ne change rien (retrait non supporté)', async () => {
    const f = await ouvrir({ assigned: ['Amadou'] });
    const c = f.componentInstance;
    const amadou = c.filtered().find((a) => a.username === 'Amadou')!;
    c.toggle(amadou);
    expect(c.isSelected(amadou)).toBe(true);
  });

  it('un agent désactivé ne peut pas être coché', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const chantal = c.filtered().find((a) => a.username === 'Chantal')!;
    c.toggle(chantal);
    expect(c.isSelected(chantal)).toBe(false);
  });

  it('coche/décoche un agent actif non affecté', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const beatrice = c.filtered().find((a) => a.username === 'Béatrice')!;
    c.toggle(beatrice);
    expect(c.isSelected(beatrice)).toBe(true);
    c.toggle(beatrice);
    expect(c.isSelected(beatrice)).toBe(false);
  });

  it('filtre la liste par le champ de recherche (insensible à la casse)', async () => {
    const f = await ouvrir();
    f.componentInstance.onSearch('ama');
    expect(f.componentInstance.filtered().map((a) => a.username)).toEqual(['Amadou']);
  });

  it('sous-titre au singulier pour un seul agent sélectionné', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    expect(c.sousTitreCle()).toBe('CAMPAGNES.AGENTS_SHEET.SUBTITLE_SINGULAR');
  });

  it('sous-titre au pluriel pour plusieurs agents, et au zéro pour aucun', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    expect(c.sousTitreCle()).toBe('CAMPAGNES.AGENTS_SHEET.SUBTITLE_ZERO');
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    c.toggle(c.filtered().find((a) => a.username === 'Béatrice')!);
    expect(c.sousTitreCle()).toBe('CAMPAGNES.AGENTS_SHEET.SUBTITLE_PLURAL');
  });

  it('n’appelle aucune mutation et ferme directement si rien de nouveau n’est coché', async () => {
    const f = await ouvrir({ assigned: ['Amadou'] });
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    await c.onSave();
    expect(affecterAgent).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('n’affecte que les agents nouvellement cochés, pas ceux déjà affectés', async () => {
    const f = await ouvrir({ assigned: ['Amadou'] });
    const c = f.componentInstance;
    c.toggle(c.filtered().find((a) => a.username === 'Béatrice')!);
    await c.onSave();
    expect(affecterAgent).toHaveBeenCalledTimes(1);
    expect(affecterAgent).toHaveBeenCalledWith('camp-1', 'u2');
  });

  it('affecte chaque agent coché un par un', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    c.toggle(c.filtered().find((a) => a.username === 'Béatrice')!);
    await c.onSave();
    expect(affecterAgent).toHaveBeenCalledTimes(2);
    expect(affecterAgent).toHaveBeenCalledWith('camp-1', 'u1');
    expect(affecterAgent).toHaveBeenCalledWith('camp-1', 'u2');
  });

  it('émet saved puis close après un enregistrement réussi', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const savedSpy = vi.fn();
    const closeSpy = vi.fn();
    c.saved.subscribe(savedSpy);
    c.close.subscribe(closeSpy);
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    await c.onSave();
    expect(savedSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('ne ferme pas et affiche un toast si une affectation échoue', async () => {
    const f = await ouvrir();
    affecterAgent.mockRejectedValueOnce(new Error('Agent déjà affecté à une autre zone'));
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    await c.onSave();
    expect(erreurToast).toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(c.saving()).toBe(false);
  });

  it('ne relance pas l’enregistrement si un est déjà en vol', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.toggle(c.filtered().find((a) => a.username === 'Amadou')!);
    c.saving.set(true);
    await c.onSave();
    expect(affecterAgent).not.toHaveBeenCalled();
  });

  it('aucun agent disponible : liste vide, sans planter', async () => {
    const f = await ouvrir({ agents: [] });
    expect(f.componentInstance.filtered()).toHaveLength(0);
  });

  it('la fermeture émet close sans déclencher de mutation', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    c.onClose();
    expect(closeSpy).toHaveBeenCalled();
    expect(affecterAgent).not.toHaveBeenCalled();
  });

  it('initiale d’affichage : première lettre en majuscule, ou "?" si le nom est vide', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    expect(c.initial('amadou')).toBe('A');
    expect(c.initial('')).toBe('?');
  });
});
