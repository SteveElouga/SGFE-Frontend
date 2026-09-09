import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DataTableComponent, DataTableColumn, SortState } from './data-table.component';

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

interface Personne { id: string; nom: string; age: number | null; dateIso: string; }

const SORT_COLUMNS: DataTableColumn[] = [
  { key: 'nom', header: 'Nom', sortable: true },
  { key: 'age', header: 'Age', sortable: true },
  { key: 'date', header: 'Date', sortable: true, sortValue: (row) => new Date((row as Personne).dateIso) },
];

const PERSONNES: Personne[] = [
  { id: '1', nom: 'Charlie', age: 30, dateIso: '2026-03-01' },
  { id: '2', nom: 'Alice', age: null, dateIso: '2026-01-01' },
  { id: '3', nom: 'Bob', age: 25, dateIso: '2026-02-01' },
];

function monterTri(rows: Personne[] = PERSONNES) {
  TestBed.configureTestingModule({
    imports: [DataTableComponent],
    providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
  });
  const fixture = TestBed.createComponent(DataTableComponent<Personne>);
  fixture.componentRef.setInput('columns', SORT_COLUMNS);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('trackKey', 'id');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
}

function nomsAffiches(racine: HTMLElement): string[] {
  return Array.from(racine.querySelectorAll('tbody tr')).map(
    (tr) => (tr.querySelector('td') as HTMLElement).textContent!.trim(),
  );
}

describe('DataTableComponent — tri par colonne (rendu réel)', () => {
  it('cycle asc → desc → non trié en cliquant sur l’en-tête, et émet sortChange', () => {
    const { fixture, component, racine } = monterTri();
    const emitted: (SortState | null)[] = [];
    component.sortChange.subscribe((s) => emitted.push(s));
    const boutonNom = racine.querySelectorAll('.dt__sort-btn')[0] as HTMLButtonElement;

    boutonNom.click();
    fixture.detectChanges();
    expect(component.sortDirectionOf('nom')).toBe('asc');
    expect(nomsAffiches(racine)).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(racine.querySelectorAll('th')[0].getAttribute('aria-sort')).toBe('ascending');

    boutonNom.click();
    fixture.detectChanges();
    expect(component.sortDirectionOf('nom')).toBe('desc');
    expect(nomsAffiches(racine)).toEqual(['Charlie', 'Bob', 'Alice']);
    expect(racine.querySelectorAll('th')[0].getAttribute('aria-sort')).toBe('descending');

    boutonNom.click();
    fixture.detectChanges();
    expect(component.sortDirectionOf('nom')).toBeNull();
    expect(nomsAffiches(racine)).toEqual(['Charlie', 'Alice', 'Bob']); // ordre d'origine retrouvé
    expect(racine.querySelectorAll('th')[0].getAttribute('aria-sort')).toBe('none');

    expect(emitted).toEqual([
      { key: 'nom', direction: 'asc' },
      { key: 'nom', direction: 'desc' },
      null,
    ]);
  });

  it('changer de colonne repart toujours en asc', () => {
    const { component } = monterTri();
    component.toggleSort('nom');
    component.toggleSort('nom'); // desc
    component.toggleSort('age'); // nouvelle colonne : repart en asc
    expect(component.sortState()).toEqual({ key: 'age', direction: 'asc' });
  });

  it('ignore le tri sur une colonne non déclarée sortable', () => {
    const { component } = monterTri();
    component.toggleSort('inconnue');
    expect(component.sortState()).toBeNull();
  });

  it('trie par date via `sortValue` (comparaison Date, pas chaîne)', () => {
    const { component } = monterTri();
    component.toggleSort('date');
    expect(component.sortedRows().map((r) => r.id)).toEqual(['2', '3', '1']); // janv, févr, mars
  });

  it('place systématiquement les valeurs null en fin de tri, asc comme desc', () => {
    const { component } = monterTri();
    component.toggleSort('age'); // asc
    expect(component.sortedRows().map((r) => r.age)).toEqual([25, 30, null]);
    component.toggleSort('age'); // desc
    expect(component.sortedRows().map((r) => r.age)).toEqual([30, 25, null]);
  });

  it('deux valeurs null ne sont jamais réordonnées entre elles', () => {
    const rows: Personne[] = [
      { id: '1', nom: 'A', age: null, dateIso: '2026-01-01' },
      { id: '2', nom: 'B', age: null, dateIso: '2026-01-02' },
    ];
    const { component } = monterTri(rows);
    component.toggleSort('age');
    expect(component.sortedRows().map((r) => r.id)).toEqual(['1', '2']);
  });

  it('une valeur connue reste avant un null placé après elle', () => {
    const { component } = monterTri([
      { id: 'a', nom: 'A', age: 5, dateIso: '2026-01-01' },
      { id: 'b', nom: 'B', age: null, dateIso: '2026-01-01' },
    ]);
    component.toggleSort('age');
    expect(component.sortedRows().map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('un null placé avant une valeur connue passe quand même derrière elle', () => {
    const { component } = monterTri([
      { id: 'a', nom: 'A', age: null, dateIso: '2026-01-01' },
      { id: 'b', nom: 'B', age: 5, dateIso: '2026-01-01' },
    ]);
    component.toggleSort('age');
    expect(component.sortedRows().map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('DataTableComponent — pagination client (rendu réel)', () => {
  const LIGNES = Array.from({ length: 7 }, (_, i) => ({ id: String(i), nom: `L${i}` }));

  function monterPagination(pageSize = 3, rows: Row[] = LIGNES) {
    TestBed.configureTestingModule({
      imports: [DataTableComponent],
      providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(DataTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('trackKey', 'id');
    fixture.componentRef.setInput('pageSize', pageSize);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it('goPage change la page affichée en mode client', () => {
    const { component } = monterPagination(3);
    expect(component.pagedRows().map((r) => r.id)).toEqual(['0', '1', '2']);
    component.goPage(1);
    expect(component.pagedRows().map((r) => r.id)).toEqual(['3', '4', '5']);
    component.goPage(2);
    expect(component.pagedRows().map((r) => r.id)).toEqual(['6']);
  });

  it('goPage ignore une cible hors bornes en mode client', () => {
    const { component } = monterPagination(3);
    component.goPage(-1);
    component.goPage(99);
    expect(component.pagedRows().map((r) => r.id)).toEqual(['0', '1', '2']); // page inchangée
  });

  it('cliquer sur un numéro de page du pied change réellement les lignes affichées', () => {
    const { fixture, racine } = monterPagination(3);
    const boutons = Array.from(racine.querySelectorAll('.dt__pages .dt__page-btn')) as HTMLButtonElement[];
    const bouton2 = boutons.find((b) => b.textContent?.trim() === '2')!;

    bouton2.click();
    fixture.detectChanges();

    const lignes = Array.from(racine.querySelectorAll('tbody tr')).map(
      (tr) => (tr.querySelector('td') as HTMLElement).textContent!.trim(),
    );
    expect(lignes).toEqual(['L3', 'L4', 'L5']);
    expect(bouton2.classList.contains('dt__page-btn--active')).toBe(true);
  });

  it('le bouton « page suivante » avance d’une page, « précédente » recule', () => {
    const { fixture, racine } = monterPagination(3);
    const suivant = racine.querySelector('.dt__pages .dt__page-btn[aria-label="COMMON.NEXT_PAGE"]') as HTMLButtonElement;
    suivant.click();
    fixture.detectChanges();
    const lignesApresSuivant = Array.from(racine.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent!.trim());
    expect(lignesApresSuivant).toEqual(['L3', 'L4', 'L5']);

    const precedent = racine.querySelector('.dt__pages .dt__page-btn[aria-label="COMMON.PREV_PAGE"]') as HTMLButtonElement;
    precedent.click();
    fixture.detectChanges();
    const lignesApresPrecedent = Array.from(racine.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent!.trim());
    expect(lignesApresPrecedent).toEqual(['L0', 'L1', 'L2']);
  });

  it('pageSize=0 désactive la pagination : toutes les lignes tiennent sur une page', () => {
    const { component, racine } = monterPagination(0);
    expect(component.pageCount()).toBe(1);
    expect(component.pagedRows()).toHaveLength(7);
    expect(racine.querySelectorAll('.dt__pages')).toHaveLength(0);
  });

  it('total() vaut 0 et le pied disparaît quand `rows` est vide', () => {
    const { component, racine } = monterPagination(3, []);
    expect(component.total()).toBe(0);
    expect(component.rangeStart()).toBe(0);
    expect(racine.querySelector('.dt__footer')).toBeNull();
  });
});

describe('DataTableComponent — clic de ligne et navigation (rendu réel)', () => {
  function monterClic(opts: {
    rowClickable?: boolean | ((r: Row) => boolean);
    rowLink?: (r: Row) => string[] | string | null;
  } = {}) {
    TestBed.configureTestingModule({
      imports: [DataTableComponent],
      providers: [provideRouter([]), ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(DataTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('trackKey', 'id');
    if (opts.rowClickable !== undefined) fixture.componentRef.setInput('rowClickable', opts.rowClickable);
    if (opts.rowLink) fixture.componentRef.setInput('rowLink', opts.rowLink);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, router };
  }

  it('un clic sur une ligne explicitement cliquable émet rowClick', () => {
    const { fixture, component, racine } = monterClic({ rowClickable: true });
    const emitted: Row[] = [];
    component.rowClick.subscribe((r) => emitted.push(r));

    (racine.querySelector('tbody tr') as HTMLElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual([ROWS[0]]);
    expect(racine.querySelector('tbody tr')!.classList.contains('dt__row--clickable')).toBe(true);
  });

  it('une ligne non cliquable (comportement par défaut) n’émet rien au clic', () => {
    const { component, racine } = monterClic();
    const emitted: Row[] = [];
    component.rowClick.subscribe((r) => emitted.push(r));

    (racine.querySelector('tbody tr') as HTMLElement).click();

    expect(emitted).toEqual([]);
    expect(racine.querySelector('tbody tr')!.classList.contains('dt__row--clickable')).toBe(false);
  });

  it('rowClickable en fonction décide ligne par ligne', () => {
    const { component } = monterClic({ rowClickable: (r) => r.id === '2' });
    expect(component.isRowClickable(ROWS[0])).toBe(false);
    expect(component.isRowClickable(ROWS[1])).toBe(true);
  });

  it('fournir `rowLink` rend la ligne cliquable et navigue au clic', () => {
    const { fixture, racine, router } = monterClic({ rowLink: (r) => ['/x', r.id] });
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const lien = racine.querySelector('tbody tr a.dt__lien') as HTMLAnchorElement;
    expect(lien).toBeTruthy(); // la 1ère cellule devient un vrai lien

    (racine.querySelector('tbody tr') as HTMLElement).click();
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/x', '1']);
  });

  it('un clic né sur le lien projeté lui-même n’est pas doublé par le clic de ligne', () => {
    const { fixture, racine, router } = monterClic({ rowLink: (r) => ['/x', r.id] });
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    // Le `routerLink` natif de l'ancre tente lui aussi une vraie navigation
    // au clic — sans issue avec `provideRouter([])`, mais asynchrone : on la
    // neutralise pour ne pas laisser une promesse en vol après la fin du test.
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const lien = racine.querySelector('tbody tr a.dt__lien') as HTMLAnchorElement;

    lien.click();
    fixture.detectChanges();

    // Le clic est né à l'intérieur d'un <a> : `onRowClick` se retire pour
    // laisser le routerLink natif gérer seul la navigation.
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
