import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { FacturesTableComponent } from './factures-table.component';
import type { FactureLigne } from '../../../../graphql/vues';

/**
 * Table purement présentationnelle (voir le commentaire du composant) : pas
 * d'Apollo à mocker, seulement le rendu selon `factures()`/`showConso()` et
 * les deux comportements programmatiques (`formatFCFA`, `periodeFacture`).
 */
function facture(p: Partial<FactureLigne> = {}): FactureLigne {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-2026-08-0001',
    abonneId: 'a-1',
    abonneNom: 'Diallo',
    abonneNumero: 'AB-0001',
    campagneId: 'camp-1',
    campagneNom: 'Août 2026',
    campagnePeriodeMois: 8,
    campagnePeriodeAnnee: 2026,
    statut: 'IMPAYEE',
    consommation: 20,
    montant: 10_000,
    dateReleve: '2026-08-01',
    dateLimitePaiement: '2026-08-16',
    ...p,
  } as FactureLigne;
}

describe('FacturesTableComponent', () => {
  function monter(inputs: Partial<{ factures: readonly FactureLigne[]; showConso: boolean }> = {}) {
    TestBed.configureTestingModule({
      imports: [FacturesTableComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(FacturesTableComponent);
    fixture.componentRef.setInput('factures', inputs.factures ?? []);
    if (inputs.showConso !== undefined) {
      fixture.componentRef.setInput('showConso', inputs.showConso);
    }
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    return { fixture, c: fixture.componentInstance, racine };
  }

  it("affiche l'état vide quand la liste est vide", () => {
    const { racine } = monter({ factures: [] });
    expect(racine.querySelector('.abonne-invoices__empty')).toBeTruthy();
    expect(racine.querySelectorAll('tbody tr')).toHaveLength(1); // seulement la ligne vide
  });

  it("l'état vide s'étend sur 5 colonnes quand la conso est affichée", () => {
    const { racine } = monter({ factures: [], showConso: true });
    const cell = racine.querySelector('.abonne-invoices__empty') as HTMLElement;
    expect(cell.getAttribute('colspan')).toBe('5');
  });

  it("l'état vide s'étend sur 4 colonnes quand la conso est masquée", () => {
    const { racine } = monter({ factures: [], showConso: false });
    const cell = racine.querySelector('.abonne-invoices__empty') as HTMLElement;
    expect(cell.getAttribute('colspan')).toBe('4');
  });

  it('affiche une ligne par facture, dans l’ordre reçu', () => {
    const { racine } = monter({
      factures: [facture({ factureId: 'f-1' }), facture({ factureId: 'f-2' }), facture({ factureId: 'f-3' })],
    });
    expect(racine.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('affiche une seule ligne pour une seule facture', () => {
    const { racine } = monter({ factures: [facture()] });
    expect(racine.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(racine.querySelector('.abonne-invoices__empty')).toBeNull();
  });

  it('affiche la colonne consommation par défaut', () => {
    const { racine } = monter({ factures: [facture({ consommation: 27 })] });
    const headers = [...racine.querySelectorAll('thead th')];
    expect(headers).toHaveLength(5);
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('27 m³');
  });

  it('masque la colonne consommation quand showConso vaut false (onglet Impayés)', () => {
    const { racine } = monter({ factures: [facture({ consommation: 27 })], showConso: false });
    const headers = [...racine.querySelectorAll('thead th')];
    expect(headers).toHaveLength(4);
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).not.toContain('27 m³');
  });

  it('formate le montant en FCFA avec séparateur de milliers', () => {
    const { racine } = monter({ factures: [facture({ montant: 12_345 })] });
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toMatch(/12[\s ]?345 FCFA/);
  });

  it('arrondit un montant fractionnaire plutôt que de le tronquer', () => {
    const { racine } = monter({ factures: [facture({ montant: 999.6 })] });
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toMatch(/1[\s ]?000 FCFA/);
  });

  it('affiche 0 FCFA pour un montant nul', () => {
    const { racine } = monter({ factures: [facture({ montant: 0 })] });
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('0 FCFA');
  });

  it('porte le statut en classe de badge, en minuscules', () => {
    const { racine } = monter({ factures: [facture({ statut: 'PAYEE' })] });
    expect(racine.querySelector('.facture-badge--payee')).toBeTruthy();
  });

  it('affiche un tiret quand la date de relevé est absente', () => {
    const { racine } = monter({ factures: [facture({ dateReleve: '' })] });
    const row = racine.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('—');
  });

  it('formate la période en français par défaut (mois abrégé + année)', () => {
    const { c } = monter();
    expect(c.periodeFacture(facture({ dateReleve: '2026-08-01' }))).toBe(
      new Date('2026-08-01').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
    );
  });

  it('formate la période en anglais quand la langue courante est en', () => {
    TestBed.configureTestingModule({
      imports: [FacturesTableComponent],
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.use('en');
    const fixture = TestBed.createComponent(FacturesTableComponent);
    fixture.componentRef.setInput('factures', []);
    fixture.detectChanges();

    expect(fixture.componentInstance.periodeFacture(facture({ dateReleve: '2026-08-01' }))).toBe(
      new Date('2026-08-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    );
  });

  it('émet pdfClick avec le factureId de la ligne cliquée', () => {
    const { racine, c } = monter({
      factures: [facture({ factureId: 'f-1' }), facture({ factureId: 'f-2' })],
    });
    const recu: string[] = [];
    c.pdfClick.subscribe((id) => recu.push(id));

    const boutons = racine.querySelectorAll('.abonne-invoices__pdf');
    (boutons[1] as HTMLButtonElement).click();

    expect(recu).toEqual(['f-2']);
  });

  it('stoppe la propagation du clic sur le bouton PDF', () => {
    const { c } = monter({ factures: [facture({ factureId: 'f-1' })] });
    const ev = new MouseEvent('click');
    const spy = vi.spyOn(ev, 'stopPropagation');

    c.onPdfClick('f-1', ev);

    expect(spy).toHaveBeenCalled();
  });
});
