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
