import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ImportCoordonneesSheetComponent } from './import-coordonnees-sheet.component';
import { CarteService } from '../services/carte.service';

function fichierCsv(contenu: string, nom = 'coordonnees.csv'): File {
  return new File([contenu], nom, { type: 'text/csv' });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function setup(carteServiceOverrides: Partial<CarteService> = {}) {
  const importerCoordonnees = vi.fn().mockResolvedValue({ nbImportees: 0, erreurs: [] });
  TestBed.configureTestingModule({
    imports: [ImportCoordonneesSheetComponent],
    providers: [
      provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      { provide: CarteService, useValue: { importerCoordonnees, ...carteServiceOverrides } },
    ],
  });
  const fixture = TestBed.createComponent(ImportCoordonneesSheetComponent);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, importerCoordonnees };
}

describe('ImportCoordonneesSheetComponent', () => {
  it('parse un CSV valide et propose son import (aperçu avant tout envoi)', async () => {
    const { fixture, c, racine } = setup();
    const input = racine.querySelector<HTMLInputElement>('input[type="file"]')!;
    const fichier = fichierCsv('numero_compteur,latitude,longitude\n1234,4.05,9.70');
    Object.defineProperty(input, 'files', { value: [fichier] });
    input.dispatchEvent(new Event('change'));
    await flush();
    fixture.detectChanges();

    expect(c.lignes()).toHaveLength(1);
    expect(c.lignesValides()).toHaveLength(1);
    expect(c.peutImporter()).toBe(true);
    expect(racine.textContent).toContain('1234');
  });

  it('désactive l’import quand aucune ligne n’est valide', () => {
    const { c } = setup();
    c.lignes.set([
      { ligne: 2, numeroCompteurBrut: 'ABC', latitudeBrut: '95', longitudeBrut: '200', statut: 'FORMAT_INVALIDE', erreur: 'x' },
    ]);
    expect(c.lignesValides()).toHaveLength(0);
    expect(c.peutImporter()).toBe(false);
  });

  it('importe les lignes valides, affiche le résultat serveur et émet importReussi', async () => {
    const { fixture, c, racine, importerCoordonnees } = setup();
    importerCoordonnees.mockResolvedValue({
      nbImportees: 1,
      erreurs: [{ numeroCompteur: '9999', message: 'compteur introuvable' }],
    });
    const emis: number[] = [];
    c.importReussi.subscribe((n) => emis.push(n));
    c.lignes.set([
      { ligne: 1, numeroCompteurBrut: '1234', latitudeBrut: '4.05', longitudeBrut: '9.70', statut: 'A_IMPORTER', erreur: '' },
    ]);
    fixture.detectChanges();

    await c.importer();
    fixture.detectChanges();

    expect(importerCoordonnees).toHaveBeenCalledWith(c.lignes());
    expect(emis).toEqual([1]);
    expect(racine.textContent).toContain('compteur introuvable');
  });

  it('affiche un message d’erreur explicite quand l’import serveur échoue', async () => {
    const { fixture, c, racine } = setup({
      importerCoordonnees: vi.fn().mockRejectedValue(new Error('Gateway indisponible')),
    });
    c.lignes.set([
      { ligne: 1, numeroCompteurBrut: '1234', latitudeBrut: '4.05', longitudeBrut: '9.70', statut: 'A_IMPORTER', erreur: '' },
    ]);
    fixture.detectChanges();

    await c.importer();
    fixture.detectChanges();

    expect(racine.textContent).toContain('Gateway indisponible');
  });

  it('réinitialise l’état (fichier, lignes, erreur) à chaque réouverture', () => {
    const { fixture, c } = setup();
    c.lignes.set([{ ligne: 1, numeroCompteurBrut: '1', latitudeBrut: '1', longitudeBrut: '1', statut: 'A_IMPORTER', erreur: '' }]);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(c.lignes()).toEqual([]);
  });
});
