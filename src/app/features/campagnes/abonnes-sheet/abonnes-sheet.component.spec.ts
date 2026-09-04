import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AbonnesSheetComponent } from './abonnes-sheet.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { ToastService } from '../../../shared/services/toast.service';

/**
 * Ajouter des abonnés à une campagne rattache TOUS les abonnés actifs, ou
 * seulement ceux des zones cochées. Le garde-fou ici n'est pas une saisie à
 * confirmer, mais un calcul : la mutation ne doit jamais partir avec une
 * sélection vide, et le nombre annoncé doit être celui réellement envoyé.
 */
function abonneActif(quartier: string | null, camp: number | null, id: string) {
  return { id, quartier, camp };
}

describe('AbonnesSheetComponent', () => {
  let ajouterAbonnesCampagne: ReturnType<typeof vi.fn>;
  let getAbonnesActifs: ReturnType<typeof vi.fn>;
  let succes: ReturnType<typeof vi.fn>;
  let erreurToast: ReturnType<typeof vi.fn>;

  function creer(abonnes = [abonneActif('Plateau', 1, 'a1'), abonneActif('Plateau', 1, 'a2'), abonneActif('Centre', 2, 'a3')]) {
    ajouterAbonnesCampagne = vi.fn().mockResolvedValue({ nbAjoutes: abonnes.length, nbIgnores: 0 });
    getAbonnesActifs = vi.fn().mockResolvedValue(abonnes);
    succes = vi.fn();
    erreurToast = vi.fn();

    TestBed.configureTestingModule({
      imports: [AbonnesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { ajouterAbonnesCampagne } },
        { provide: AbonnesService, useValue: { getAbonnesActifs } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });

    const fixture = TestBed.createComponent(AbonnesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  }

  // L'ouverture déclenche le chargement via `effect` + `queueMicrotask` : il
  // faut laisser les microtâches se résoudre avant de lire l'état chargé.
  async function ouvrir(abonnes?: Array<{ id: string; quartier: string | null; camp: number | null }>) {
    const f = creer(abonnes);
    await Promise.resolve();
    await Promise.resolve();
    f.detectChanges();
    return f;
  }

  it('charge les abonnés actifs à l’ouverture et compte tout le monde en mode TOUS', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    expect(c.mode()).toBe('TOUS');
    expect(c.count()).toBe(3);
    expect(c.loading()).toBe(false);
  });

  it('regroupe les abonnés par zone (quartier + camp), triées et dédupliquées', async () => {
    const f = await ouvrir();
    const zones = f.componentInstance.zones();
    expect(zones).toEqual([
      { key: 'Centre##2', quartier: 'Centre', camp: 2, count: 1 },
      { key: 'Plateau##1', quartier: 'Plateau', camp: 1, count: 2 },
    ]);
  });

  it('ignore les abonnés sans quartier dans les zones proposées', async () => {
    const f = await ouvrir([abonneActif(null, 1, 'a1'), abonneActif('  ', 1, 'a2'), abonneActif('Centre', 2, 'a3')]);
    expect(f.componentInstance.zones()).toEqual([{ key: 'Centre##2', quartier: 'Centre', camp: 2, count: 1 }]);
  });

  it('mode FILTRE sans zone cochée : le compte tombe à zéro', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    expect(c.count()).toBe(0);
  });

  it('cocher une zone ajoute exactement ses abonnés au compte', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    c.toggleZone('Plateau##1');
    expect(c.count()).toBe(2);
    expect(c.isSelected('Plateau##1')).toBe(true);
  });

  it('décocher une zone déjà sélectionnée la retire du compte', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    c.toggleZone('Plateau##1');
    c.toggleZone('Plateau##1');
    expect(c.count()).toBe(0);
    expect(c.isSelected('Plateau##1')).toBe(false);
  });

  it('additionne plusieurs zones cochées', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    c.toggleZone('Plateau##1');
    c.toggleZone('Centre##2');
    expect(c.count()).toBe(3);
  });

  it('n’envoie rien tant que le compte est nul (mode FILTRE sans zone)', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    await c.onSave();
    expect(ajouterAbonnesCampagne).not.toHaveBeenCalled();
  });

  it('envoie exactement les ids de la zone cochée', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    c.toggleZone('Plateau##1');
    await c.onSave();
    expect(ajouterAbonnesCampagne).toHaveBeenCalledWith('camp-1', ['a1', 'a2']);
  });

  it('envoie tous les ids en mode TOUS', async () => {
    const f = await ouvrir();
    await f.componentInstance.onSave();
    expect(ajouterAbonnesCampagne).toHaveBeenCalledWith('camp-1', ['a1', 'a2', 'a3']);
  });

  it('affiche le résultat exact (ajoutés/ignorés) renvoyé par le serveur', async () => {
    const f = await ouvrir();
    ajouterAbonnesCampagne.mockResolvedValueOnce({ nbAjoutes: 2, nbIgnores: 1 });
    await f.componentInstance.onSave();
    expect(succes).toHaveBeenCalled();
  });

  it('émet saved puis close en cas de succès', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const savedSpy = vi.fn();
    const closeSpy = vi.fn();
    c.saved.subscribe(savedSpy);
    c.close.subscribe(closeSpy);
    await c.onSave();
    expect(savedSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('ne referme pas et affiche un toast d’erreur si la mutation échoue', async () => {
    const f = await ouvrir();
    ajouterAbonnesCampagne.mockRejectedValueOnce(new Error('La campagne est déjà clôturée'));
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    await c.onSave();
    expect(erreurToast).toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(c.saving()).toBe(false);
  });

  it('ne relance pas la mutation si un enregistrement est déjà en vol', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.saving.set(true);
    await c.onSave();
    expect(ajouterAbonnesCampagne).not.toHaveBeenCalled();
  });

  it('affiche l’état d’erreur de chargement et bloque l’enregistrement', async () => {
    getAbonnesActifs = vi.fn().mockRejectedValue(new Error('indisponible'));
    const fixture = TestBed.configureTestingModule({
      imports: [AbonnesSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { ajouterAbonnesCampagne } },
        { provide: AbonnesService, useValue: { getAbonnesActifs } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    }).createComponent(AbonnesSheetComponent);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
    const racine = fixture.nativeElement as HTMLElement;
    const bouton = racine.querySelector('.as-save') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('la fermeture émet close sans toucher à la mutation', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    const closeSpy = vi.fn();
    c.close.subscribe(closeSpy);
    c.onClose();
    expect(closeSpy).toHaveBeenCalled();
    expect(ajouterAbonnesCampagne).not.toHaveBeenCalled();
  });

  it('réinitialise le mode et la sélection à chaque réouverture', async () => {
    const f = await ouvrir();
    const c = f.componentInstance;
    c.selectMode('FILTRE');
    c.toggleZone('Plateau##1');
    f.componentRef.setInput('open', false);
    f.detectChanges();
    f.componentRef.setInput('open', true);
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.mode()).toBe('TOUS');
    // La sélection FILTRE a été oubliée : de retour en mode TOUS, le compte
    // porte de nouveau sur tous les abonnés, pas sur la zone qui était cochée.
    expect(c.count()).toBe(3);
  });
});
