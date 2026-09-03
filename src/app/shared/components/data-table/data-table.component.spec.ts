import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DataTableComponent, DataTableColumn } from './data-table.component';

interface Row {
  id: string;
  nom: string;
}

const COLUMNS: DataTableColumn[] = [{ key: 'nom', header: 'Nom' }];
const ROWS: Row[] = [
  { id: '1', nom: 'A' },
  { id: '2', nom: 'B' },
  { id: '3', nom: 'C' },
];

function setup(rows: Row[] = ROWS, selectedIds: ReadonlySet<string> = new Set()) {
  TestBed.configureTestingModule({
    imports: [DataTableComponent],
    providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
  });
  const fixture = TestBed.createComponent(DataTableComponent<Row>);
  fixture.componentRef.setInput('columns', COLUMNS);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('trackKey', 'id');
  fixture.componentRef.setInput('selectable', true);
  fixture.componentRef.setInput('selectedIds', selectedIds);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('DataTableComponent — sélection', () => {
  it('isSelected reflète selectedIds', () => {
    const { component } = setup(ROWS, new Set(['2']));
    expect(component.isSelected(ROWS[0])).toBe(false);
    expect(component.isSelected(ROWS[1])).toBe(true);
  });

  it('toggleRowSelection ajoute puis retire une ligne', () => {
    const { component } = setup();
    const emitted: Set<string>[] = [];
    component.selectedIdsChange.subscribe((s) => emitted.push(s));

    component.toggleRowSelection(ROWS[0]);
    expect(emitted[0]).toEqual(new Set(['1']));
  });

  it('pageSelectionState vaut "none" sans sélection', () => {
    expect(setup(ROWS, new Set()).component.pageSelectionState()).toBe('none');
  });

  it('pageSelectionState vaut "some" pour une sélection partielle', () => {
    expect(setup(ROWS, new Set(['1'])).component.pageSelectionState()).toBe('some');
  });

  it('pageSelectionState vaut "all" quand toute la page est sélectionnée', () => {
    expect(setup(ROWS, new Set(['1', '2', '3'])).component.pageSelectionState()).toBe('all');
  });

  it('toggleSelectAllOnPage sélectionne toute la page si elle ne l\'est pas', () => {
    const { component } = setup();
    const emitted: Set<string>[] = [];
    component.selectedIdsChange.subscribe((s) => emitted.push(s));

    component.toggleSelectAllOnPage();

    expect(emitted[0]).toEqual(new Set(['1', '2', '3']));
  });

  it('toggleSelectAllOnPage désélectionne toute la page si elle l\'est déjà', () => {
    const { component } = setup(ROWS, new Set(['1', '2', '3']));
    const emitted: Set<string>[] = [];
    component.selectedIdsChange.subscribe((s) => emitted.push(s));

    component.toggleSelectAllOnPage();

    expect(emitted[0]).toEqual(new Set());
  });

  it('toggleSelectAllOnPage ne touche que la page courante', () => {
    const beaucoupDeLignes: Row[] = Array.from({ length: 7 }, (_, i) => ({ id: String(i), nom: `L${i}` }));
    TestBed.configureTestingModule({
      imports: [DataTableComponent],
      providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(DataTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', beaucoupDeLignes);
    fixture.componentRef.setInput('trackKey', 'id');
    fixture.componentRef.setInput('selectable', true);
    fixture.componentRef.setInput('pageSize', 5);
    fixture.componentRef.setInput('selectedIds', new Set());
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const emitted: Set<string>[] = [];
    component.selectedIdsChange.subscribe((s) => emitted.push(s));
    component.toggleSelectAllOnPage();

    expect(emitted[0]).toEqual(new Set(['0', '1', '2', '3', '4']));
  });
});

describe('DataTableComponent — pagination serveur', () => {
  function setupServer(rows: Row[], opts: { totalCount: number; currentPage?: number; pageSize?: number }) {
    TestBed.configureTestingModule({
      imports: [DataTableComponent],
      providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(DataTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('trackKey', 'id');
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('totalCount', opts.totalCount);
    fixture.componentRef.setInput('currentPage', opts.currentPage ?? 0);
    fixture.componentRef.setInput('pageSize', opts.pageSize ?? 3);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('affiche `rows()` telles quelles, sans les trancher ni les trier', () => {
    // Une seule page de 3 lignes reçue du serveur, sur un total de 40 : le
    // tableau ne doit rien couper — il n'a de toute façon pas les 37 autres.
    const page = [ROWS[2], ROWS[0], ROWS[1]]; // ordre volontairement non trié
    const { component } = setupServer(page, { totalCount: 40 });
    expect(component.pagedRows()).toEqual(page);
  });

  it('total()/pageCount() se basent sur totalCount, pas sur rows().length', () => {
    const { component } = setupServer(ROWS, { totalCount: 40, pageSize: 3 });
    expect(component.total()).toBe(40);
    expect(component.pageCount()).toBe(14); // ceil(40/3)
  });

  it('safePage() reflète currentPage (piloté par le parent)', () => {
    const { component } = setupServer(ROWS, { totalCount: 40, currentPage: 5 });
    expect(component.safePage()).toBe(5);
  });

  it('goPage émet pageChange sans modifier rows/safePage localement', () => {
    const { component } = setupServer(ROWS, { totalCount: 40, currentPage: 0 });
    const emitted: number[] = [];
    component.pageChange.subscribe((p) => emitted.push(p));

    component.goPage(3);

    expect(emitted).toEqual([3]);
    // Rien n'a bougé localement : le parent n'a pas encore renvoyé la page 3.
    expect(component.safePage()).toBe(0);
    expect(component.pagedRows()).toEqual(ROWS);
  });

  it('goPage ignore une cible hors bornes et n\'émet rien', () => {
    const { component } = setupServer(ROWS, { totalCount: 40, currentPage: 0, pageSize: 3 });
    const emitted: number[] = [];
    component.pageChange.subscribe((p) => emitted.push(p));

    component.goPage(-1);
    component.goPage(14); // pageCount = 14 → dernière page valide = 13

    expect(emitted).toEqual([]);
  });

  it('un changement de rows() ne réinitialise pas la page en mode serveur', () => {
    // Contrairement au mode client : recevoir la page 5 ne doit pas nous
    // ramener en page 0, sinon toute navigation s'annulerait elle-même.
    const { fixture, component } = setupServer(ROWS, { totalCount: 40, currentPage: 5 });
    fixture.componentRef.setInput('rows', [ROWS[0]]);
    fixture.detectChanges();
    expect(component.safePage()).toBe(5);
  });
});
