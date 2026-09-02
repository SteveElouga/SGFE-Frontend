import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CorrigerReleveSheetComponent } from './corriger-releve-sheet.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { ReleveLigne } from '../../../graphql/vues';

/**
 * Corriger un index déjà relevé change la consommation et la facturation à
 * venir : le garde-fou (jamais sous l'ancien index) doit tenir côté
 * formulaire, pas seulement côté serveur — sinon l'utilisateur ne le
 * découvre qu'à l'échec de la requête.
 */
function releve(p: Partial<ReleveLigne> = {}): ReleveLigne {
  return {
    releveId: 'r-1',
    abonneId: 'a-1',
    ancienIndex: 100,
    nouveauIndex: 120,
    consommation: 20,
    statut: 'RELEVE',
    observation: '',
    dateReleve: '2026-08-01',
    abonneNom: 'DUPONT',
    abonnePrenom: 'Jean',
    numeroAbonne: 'AB-0001',
    numeroCompteur: 42,
    quartier: 'Bastos',
    camp: 1,
    ...p,
  } as ReleveLigne;
}

describe('CorrigerReleveSheetComponent', () => {
  let corrigerReleve: ReturnType<typeof vi.fn>;
  let succes: ReturnType<typeof vi.fn>;
  let erreurToast: ReturnType<typeof vi.fn>;

  function creer(r: ReleveLigne = releve()) {
    corrigerReleve = vi.fn().mockResolvedValue({
      releveId: r.releveId,
      nouveauIndex: 125,
      consommation: 25,
      statut: 'RELEVE',
      audit: [],
    });
    succes = vi.fn();
    erreurToast = vi.fn();

    TestBed.configureTestingModule({
      imports: [CorrigerReleveSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: CampagnesService, useValue: { corrigerReleve } },
        { provide: ToastService, useValue: { success: succes, error: erreurToast } },
      ],
    });

    const fixture = TestBed.createComponent(CorrigerReleveSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('releve', r);
    fixture.detectChanges();
    return fixture;
  }

  it("pré-remplit le nouvel index avec l'index actuel à l'ouverture", () => {
    const f = creer(releve({ nouveauIndex: 739 }));
    expect(f.componentInstance.nouvelIndex()).toBe('739');
  });

  it('refuse une valeur non numérique', () => {
    const f = creer();
    const c = f.componentInstance;

    c.nouvelIndex.set('abc');
    expect(c.erreur()).toBe('CAMPAGNES.CORRIGER_RELEVE.ERREUR_NOMBRE');
    expect(c.peutValider()).toBe(false);
  });

  it("refuse un index inférieur à l'ancien index — la même règle que le serveur, mais avant l'aller-retour réseau", () => {
    const f = creer(releve({ ancienIndex: 100 }));
    const c = f.componentInstance;

    c.nouvelIndex.set('99');
    expect(c.erreur()).toBe('CAMPAGNES.CORRIGER_RELEVE.ERREUR_INFERIEUR');
    expect(c.peutValider()).toBe(false);
  });

  it(
    "n'échoue pas quand le champ transmet un NOMBRE — `type=\"number\"` avec ngModel " +
      'sélectionne NumberValueAccessor, qui émet un number et non la chaîne que la ' +
      'valeur initiale laisse croire',
    async () => {
      const f = creer(releve({ ancienIndex: 100 }));
      const c = f.componentInstance;

      // Ce que produit réellement (ngModelChange) sur un <input type="number">.
      c.nouvelIndex.set(150 as unknown as string);
      expect(c.erreur()).toBeNull();
      expect(c.peutValider()).toBe(true);

      await c.save();
      expect(corrigerReleve).toHaveBeenCalledWith(
        expect.objectContaining({ nouveauIndex: 150 }),
      );
    },
  );

  it('accepte un index valide (égal ou supérieur à l\'ancien)', () => {
    const f = creer(releve({ ancienIndex: 100 }));
    const c = f.componentInstance;

    c.nouvelIndex.set('100');
    expect(c.erreur()).toBeNull();
    expect(c.peutValider()).toBe(true);

    c.nouvelIndex.set('150');
    expect(c.peutValider()).toBe(true);
  });

  it("n'appelle pas le service tant que le formulaire est invalide", async () => {
    const f = creer(releve({ ancienIndex: 100 }));
    const c = f.componentInstance;

    c.nouvelIndex.set('50');
    await c.save();

    expect(corrigerReleve).not.toHaveBeenCalled();
  });

  it('transmet campagneId, abonneId, le nouvel index et une observation nettoyée', async () => {
    const f = creer(releve({ abonneId: 'a-42', ancienIndex: 100 }));
    const c = f.componentInstance;

    c.nouvelIndex.set('150');
    c.observation.set('  index mal lu  ');
    await c.save();

    expect(corrigerReleve).toHaveBeenCalledWith({
      campagneId: 'camp-1',
      abonneId: 'a-42',
      nouveauIndex: 150,
      observation: 'index mal lu',
    });
  });

  it('émet le résultat renvoyé par le serveur au succès', async () => {
    const f = creer();
    const c = f.componentInstance;
    let emis: unknown = null;
    c.saved.subscribe((v) => (emis = v));

    c.nouvelIndex.set('150');
    await c.save();

    expect(emis).toEqual({ releveId: 'r-1', nouveauIndex: 125, consommation: 25, statut: 'RELEVE', audit: [] });
  });

  it('ne part pas deux fois si une requête est encore en vol', async () => {
    const f = creer();
    const c = f.componentInstance;

    c.nouvelIndex.set('150');
    c.loading.set(true);
    await c.save();

    expect(corrigerReleve).not.toHaveBeenCalled();
  });

  it("montre l'erreur du serveur plutôt qu'un faux succès, et relève le verrou", async () => {
    const f = creer();
    const c = f.componentInstance;
    corrigerReleve.mockRejectedValueOnce(new Error('Seul un index déjà relevé peut être corrigé.'));

    c.nouvelIndex.set('150');
    await c.save();

    expect(erreurToast).toHaveBeenCalled();
    expect(succes).not.toHaveBeenCalled();
    expect(c.loading()).toBe(false);
  });
});
