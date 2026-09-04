import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ZonesSheetComponent } from './zones-sheet.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AgentAffecte, ZoneDisponible } from '../../../shared/models/campagne.model';

/**
 * Affecter des zones à un agent. `affecterZones` REMPLACE l'ensemble des zones
 * de l'agent (une zone = un seul agent) : la mutation doit donc toujours
 * recevoir la sélection complète, pas seulement les ajouts — et jamais partir
 * si le catalogue de zones n'a pas pu être chargé, sous peine d'effacer les
 * zones existantes avec une liste vide.
 */
function zone(quartier: string, camp: number, nbAbonnes: number): ZoneDisponible {
  return { quartier, camp, nbAbonnes };
}

function agentAffecte(
  agentId: string,
  username: string,
  zones: Array<{ quartier: string; camp: number }>,
): AgentAffecte {
  return {
    agentId,
    username,
    role: 'AGENT',
    statut: 'ACTIF',
    derniereActivite: null,
    nbReleves: 0,
    zones: zones.map((z) => ({ quartier: z.quartier, camp: z.camp })),
  };
}

describe('ZonesSheetComponent', () => {
  let affecterZones: ReturnType<typeof vi.fn>;
  let getZonesDisponibles: ReturnType<typeof vi.fn>;
  let succes: ReturnType<typeof vi.fn>;
  let erreurToast: ReturnType<typeof vi.fn>;

  function creer(over: {
    zones?: ZoneDisponible[];
    agents?: AgentAffecte[];
    agentId?: string;
    agentUsername?: string;
  } = {}) {
    const zones = over.zones ?? [
      zone('Plateau', 1, 12),
      zone('Centre', 2, 5),
      zone('Bastos', 1, 8),
    ];
    affecterZones = vi.fn().mockResolvedValue([]);
    getZonesDisponibles = vi.fn().mockResolvedValue(zones);
    succes = vi.fn();
    erreurToast = vi.fn();

    TestBed.configureTestingModule({
      imports: [ZonesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { affecterZones, getZonesDisponibles } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });

    const fixture = TestBed.createComponent(ZonesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('agentId', over.agentId ?? 'ag-1');
    fixture.componentRef.setInput('agentUsername', over.agentUsername ?? 'Amadou');
    fixture.componentRef.setInput('agents', over.agents ?? []);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  }

  // L'ouverture déclenche le chargement via `effect` + `queueMicrotask` : il
  // faut laisser les microtâches se résoudre avant de lire l'état chargé.
  async function ouvrir(over?: Parameters<typeof creer>[0]) {
    const f = creer(over);
    await Promise.resolve();
    await Promise.resolve();
    f.detectChanges();
    return f;
  }

  // ── Chargement et calcul des lignes ─────────────────────────────────────

  it('charge le catalogue de zones à l’ouverture', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    expect(c.rows()).toHaveLength(3);
    expect(c.loading()).toBe(false);
    expect(c.loadError()).toBe(false);
  });

  it('trie les zones par quartier puis par camp', async () => {
    const f = await ouvrir();
    expect(f.componentInstance.rows().map((r) => `${r.quartier}#${r.camp}`)).toEqual([
      'Bastos#1',
      'Centre#2',
      'Plateau#1',
    ]);
  });

  it('une seule zone au catalogue : la ligne unique s’affiche sans propriétaire', async () => {
    const f = await ouvrir({ zones: [zone('Plateau', 1, 4)] });
    const c = f.componentInstance;
    expect(c.rows()).toEqual([
      { quartier: 'Plateau', camp: 1, nbAbonnes: 4, ownerId: null, ownerUsername: null },
    ]);
  });

  it('un catalogue vide ne plante pas — aucune ligne', async () => {
    const f = await ouvrir({ zones: [] });
    expect(f.componentInstance.rows()).toHaveLength(0);
  });

  it('associe chaque zone à son propriétaire courant, dérivé de `agents`', async () => {
    const f = await ouvrir({
      agents: [agentAffecte('ag-2', 'Béatrice', [{ quartier: 'Centre', camp: 2 }])],
    });
    const c = f.componentInstance;
    const centre = c.rows().find((r) => r.quartier === 'Centre')!;
    expect(centre.ownerId).toBe('ag-2');
    expect(centre.ownerUsername).toBe('Béatrice');
    // Les autres zones restent sans propriétaire.
    expect(c.rows().find((r) => r.quartier === 'Plateau')!.ownerId).toBeNull();
  });

  // ── Pré-sélection et exclusivité ────────────────────────────────────────

  it('pré-coche les zones déjà détenues par l’agent courant', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-1', 'Amadou', [{ quartier: 'Plateau', camp: 1 }])],
    });
    const c = f.componentInstance;
    const plateau = c.rows().find((r) => r.quartier === 'Plateau')!;
    expect(c.isSelected(plateau)).toBe(true);
    expect(c.selectedCount()).toBe(1);
  });

  it('une zone détenue par un AUTRE agent est verrouillée, pas cochable', async () => {
    const f = await ouvrir({
      agents: [agentAffecte('ag-2', 'Béatrice', [{ quartier: 'Centre', camp: 2 }])],
    });
    const c = f.componentInstance;
    const centre = c.rows().find((r) => r.quartier === 'Centre')!;
    expect(c.isLocked(centre)).toBe(true);

    c.toggle(centre);
    expect(c.isSelected(centre)).toBe(false); // le clic n'a rien changé
  });

  it('une zone détenue par l’agent courant lui-même n’est pas verrouillée', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-1', 'Amadou', [{ quartier: 'Plateau', camp: 1 }])],
    });
    const c = f.componentInstance;
    const plateau = c.rows().find((r) => r.quartier === 'Plateau')!;
    expect(c.isLocked(plateau)).toBe(false);
  });

  it('coche/décoche une zone libre', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const plateau = c.rows().find((r) => r.quartier === 'Plateau')!;

    c.toggle(plateau);
    expect(c.isSelected(plateau)).toBe(true);
    c.toggle(plateau);
    expect(c.isSelected(plateau)).toBe(false);
  });

  it('le compte de zones et d’abonnés reflète exactement la sélection', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!); // 12 abonnés
    c.toggle(c.rows().find((r) => r.quartier === 'Bastos')!); // 8 abonnés

    expect(c.selectedCount()).toBe(2);
    expect(c.selectedAbonnes()).toBe(20);
  });

  it('aucune zone cochée : compte et abonnés à zéro', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    expect(c.selectedCount()).toBe(0);
    expect(c.selectedAbonnes()).toBe(0);
  });

  // ── Enregistrement : payload exact envoyé à `affecterZones` ─────────────

  it('n’appelle pas la mutation si le catalogue de zones n’a pas pu être chargé', async () => {
    getZonesDisponibles = vi.fn().mockRejectedValue(new Error('indisponible'));
    TestBed.configureTestingModule({
      imports: [ZonesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { affecterZones, getZonesDisponibles } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });
    const fixture = TestBed.createComponent(ZonesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('agentId', 'ag-1');
    fixture.componentRef.setInput('agentUsername', 'Amadou');
    fixture.componentRef.setInput('agents', []);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const c = fixture.componentInstance;
    expect(c.loadError()).toBe(true);

    await c.onSave();
    // Le filet de sécurité : jamais de mutation avec une liste vide par échec —
    // elle effacerait toutes les zones réelles de l'agent.
    expect(affecterZones).not.toHaveBeenCalled();
    expect(erreurToast).toHaveBeenCalled();
  });

  it("le bouton d'enregistrement est désactivé quand le chargement a échoué", async () => {
    getZonesDisponibles = vi.fn().mockRejectedValue(new Error('indisponible'));
    TestBed.configureTestingModule({
      imports: [ZonesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { affecterZones, getZonesDisponibles } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });
    const fixture = TestBed.createComponent(ZonesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('agentId', 'ag-1');
    fixture.componentRef.setInput('agentUsername', 'Amadou');
    fixture.componentRef.setInput('agents', []);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const bouton = racine.querySelector('.zs-save') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('envoie la sélection complète (zones déjà tenues + nouvelles coches), pas seulement les ajouts', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-1', 'Amadou', [{ quartier: 'Plateau', camp: 1 }])],
    });
    const c = f.componentInstance;
    // Plateau est déjà à lui (pré-coché) ; on ajoute Bastos.
    c.toggle(c.rows().find((r) => r.quartier === 'Bastos')!);

    await c.onSave();

    expect(affecterZones).toHaveBeenCalledWith('camp-1', 'ag-1', [
      { quartier: 'Bastos', camp: 1 },
      { quartier: 'Plateau', camp: 1 },
    ]);
  });

  it('envoie une liste vide quand l’agent ne garde aucune zone — un vidage volontaire, pas un échec', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-1', 'Amadou', [{ quartier: 'Plateau', camp: 1 }])],
    });
    const c = f.componentInstance;
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!); // décoche sa seule zone

    await c.onSave();

    expect(affecterZones).toHaveBeenCalledWith('camp-1', 'ag-1', []);
  });

  it('n’inclut jamais une zone verrouillée appartenant à un autre agent dans le payload', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-2', 'Béatrice', [{ quartier: 'Centre', camp: 2 }])],
    });
    const c = f.componentInstance;
    c.toggle(c.rows().find((r) => r.quartier === 'Centre')!); // verrouillée, sans effet
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!);

    await c.onSave();

    expect(affecterZones).toHaveBeenCalledWith('camp-1', 'ag-1', [{ quartier: 'Plateau', camp: 1 }]);
  });

  it('émet saved puis close après un enregistrement réussi', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const savedSpy = vi.fn();
    const closeSpy = vi.fn();
    c.saved.subscribe(savedSpy);
    c.close.subscribe(closeSpy);
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!);

    await c.onSave();

    expect(savedSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    expect(succes).toHaveBeenCalled();
  });

  it('ne referme pas et affiche l’erreur du serveur si la mutation échoue — pas de faux succès', async () => {
    const f = await ouvrir();
    affecterZones.mockRejectedValueOnce(new Error('Une des zones est déjà affectée à un autre agent'));
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!);

    await c.onSave();

    expect(erreurToast).toHaveBeenCalled();
    expect(succes).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(c.saving()).toBe(false); // le verrou est relevé après l'échec
  });

  it('ne relance pas la mutation si un enregistrement est déjà en vol', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.toggle(c.rows().find((r) => r.quartier === 'Plateau')!);
    c.saving.set(true);

    await c.onSave();

    expect(affecterZones).not.toHaveBeenCalled();
  });

  // ── Fermeture et réouverture ──────────────────────────────────────────

  it('la fermeture émet close sans toucher à la mutation', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);

    c.onClose();

    expect(closeSpy).toHaveBeenCalled();
    expect(affecterZones).not.toHaveBeenCalled();
  });

  it('réinitialise la sélection à chaque réouverture selon le propriétaire courant', async () => {
    const f = await ouvrir({
      agentId: 'ag-1',
      agents: [agentAffecte('ag-1', 'Amadou', [{ quartier: 'Plateau', camp: 1 }])],
    });
    const c = f.componentInstance;
    c.toggle(c.rows().find((r) => r.quartier === 'Bastos')!); // ajout non enregistré
    expect(c.selectedCount()).toBe(2);

    f.componentRef.setInput('open', false);
    f.detectChanges();
    f.componentRef.setInput('open', true);
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    // De retour à l'état réel : seul Plateau (propriété actuelle) reste coché.
    expect(c.selectedCount()).toBe(1);
    expect(c.isSelected(c.rows().find((r) => r.quartier === 'Plateau')!)).toBe(true);
  });

  it('ne recharge pas le catalogue à chaque réouverture après un premier succès', async () => {
    const f = await ouvrir();
    f.componentRef.setInput('open', false);
    f.detectChanges();
    f.componentRef.setInput('open', true);
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(getZonesDisponibles).toHaveBeenCalledTimes(1);
  });

  it('retente le chargement à la réouverture suivante si le premier a échoué', async () => {
    getZonesDisponibles = vi.fn().mockRejectedValueOnce(new Error('indisponible'));
    TestBed.configureTestingModule({
      imports: [ZonesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { affecterZones, getZonesDisponibles } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });
    const fixture = TestBed.createComponent(ZonesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('agentId', 'ag-1');
    fixture.componentRef.setInput('agentUsername', 'Amadou');
    fixture.componentRef.setInput('agents', []);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.loadError()).toBe(true);

    // Réouverture : le chargement précédent avait échoué, on retente.
    getZonesDisponibles.mockResolvedValueOnce([zone('Plateau', 1, 12)]);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(getZonesDisponibles).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.loadError()).toBe(false);
    expect(fixture.componentInstance.rows()).toHaveLength(1);
  });
});
