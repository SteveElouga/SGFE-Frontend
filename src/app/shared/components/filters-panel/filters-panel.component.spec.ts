import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { FilterDefinition, FiltersPanelComponent, FilterValues } from './filters-panel.component';
import { ToastService } from '../../services/toast.service';

/**
 * Panneau de filtres unifié : recherche debouncée, filtres chips/select selon
 * le nombre d'options, résumé de résultats, tags dismissables, et
 * synchronisation optionnelle avec l'URL. Beaucoup de `computed()` — c'est ce
 * qui se casse en silence, donc ce qui se teste ici.
 */
describe('FiltersPanelComponent', () => {
  const STATUT: FilterDefinition = {
    key: 'statut',
    label: 'ABONNES.STATUT',
    options: [
      { label: 'Actif', value: 'ACTIF' },
      { label: 'Suspendu', value: 'SUSPENDU' },
    ],
  };

  function setup(opts: {
    filters?: readonly FilterDefinition[];
    values?: FilterValues;
    resultCount?: number | null;
    totalCount?: number | null;
    syncUrl?: boolean;
    queryParams?: Record<string, string>;
    debounceMs?: number;
  } = {}) {
    const navigate = vi.fn().mockResolvedValue(true);
    const toastInfo = vi.fn();

    TestBed.configureTestingModule({
      imports: [FiltersPanelComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(opts.queryParams ?? {}) } },
        },
        { provide: ToastService, useValue: { info: toastInfo } },
      ],
    });

    const fixture = TestBed.createComponent(FiltersPanelComponent);
    fixture.componentRef.setInput('filters', opts.filters ?? [STATUT]);
    if (opts.values !== undefined) fixture.componentRef.setInput('values', opts.values);
    if (opts.resultCount !== undefined) fixture.componentRef.setInput('resultCount', opts.resultCount);
    if (opts.totalCount !== undefined) fixture.componentRef.setInput('totalCount', opts.totalCount);
    if (opts.syncUrl !== undefined) fixture.componentRef.setInput('syncUrl', opts.syncUrl);
    if (opts.debounceMs !== undefined) fixture.componentRef.setInput('debounceMs', opts.debounceMs);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, navigate, toastInfo };
  }

  // ── Répartition chips / select ────────────────────────────────────────────

  it('un filtre auto à 5 options ou moins rend en chips', () => {
    const { c } = setup({ filters: [STATUT] });
    expect(c.chipFilters()).toHaveLength(1);
    expect(c.selectFilters()).toHaveLength(0);
  });

  it('un filtre auto à plus de 5 options rend en select', () => {
    const grosFiltre: FilterDefinition = {
      key: 'quartier',
      label: 'ABONNES.QUARTIER',
      options: Array.from({ length: 6 }, (_, i) => ({ label: `Q${i}`, value: `q${i}` })),
    };
    const { c } = setup({ filters: [grosFiltre] });
    expect(c.selectFilters()).toHaveLength(1);
    expect(c.chipFilters()).toHaveLength(0);
  });

  it('render:"select" force le select même avec peu d’options', () => {
    const { c } = setup({ filters: [{ ...STATUT, render: 'select' }] });
    expect(c.selectFilters()).toHaveLength(1);
    expect(c.chipFilters()).toHaveLength(0);
  });

  it('render:"chips" force les chips même avec beaucoup d’options', () => {
    const grosFiltre: FilterDefinition = {
      key: 'quartier',
      label: 'ABONNES.QUARTIER',
      render: 'chips',
      options: Array.from({ length: 8 }, (_, i) => ({ label: `Q${i}`, value: `q${i}` })),
    };
    const { c } = setup({ filters: [grosFiltre] });
    expect(c.chipFilters()).toHaveLength(1);
  });

  // ── Filtres actifs ─────────────────────────────────────────────────────────

  it('activeCount compte les filtres clearable à valeur non vide', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    expect(c.activeCount()).toBe(1);
  });

  it('activeCount ignore les valeurs null, undefined ou vides', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: null } });
    expect(c.activeCount()).toBe(0);
  });

  it('activeCount ignore un filtre non-clearable même actif', () => {
    const { c } = setup({ filters: [{ ...STATUT, clearable: false }], values: { statut: 'ACTIF' } });
    expect(c.activeCount()).toBe(0);
  });

  it('le libellé du déclencheur de la feuille inclut le nombre de filtres actifs', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    expect(c.filtresTriggerLabel()).toContain('(1)');
  });

  // ── Résumé de résultats ────────────────────────────────────────────────────

  it("n'affiche pas de ligne résultat quand rien ne la justifie", () => {
    const { c } = setup({ resultCount: 10, totalCount: 10 });
    expect(c.afficheResultat()).toBe(false);
  });

  it('affiche la ligne résultat quand la liste est filtrée', () => {
    const { c } = setup({ resultCount: 3, totalCount: 10, values: { statut: 'ACTIF' } });
    expect(c.afficheResultat()).toBe(true);
  });

  it('affiche la ligne résultat quand il n’y a aucun résultat', () => {
    const { c } = setup({ resultCount: 0, totalCount: 10 });
    expect(c.afficheResultat()).toBe(true);
  });

  it('activeTags ne retient que les filtres masqués au point de rupture courant', () => {
    const cache: FilterDefinition = { ...STATUT, visibility: 'desktop-only' };
    const { c } = setup({ filters: [cache], values: { statut: 'ACTIF' } });
    expect(c.activeTags()).toHaveLength(1);
    expect(c.activeTags()[0]).toMatchObject({ key: 'statut', valueLabel: 'Actif' });
  });

  it('activeTags ignore un filtre visible partout (both)', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    expect(c.activeTags()).toHaveLength(0);
  });

  it('heroSubtitle résume un seul tag par sa valeur', () => {
    const cache: FilterDefinition = { ...STATUT, visibility: 'desktop-only' };
    const { c } = setup({ filters: [cache], values: { statut: 'ACTIF' }, resultCount: 5, totalCount: 5 });
    expect(c.heroSubtitle()).toBe('Actif');
  });

  // ── Modification des filtres ───────────────────────────────────────────────

  it('setFilterValue met à jour la valeur locale et émet valuesChange', () => {
    const { c } = setup({ filters: [STATUT] });
    const recu: FilterValues[] = [];
    c.valuesChange.subscribe((v) => recu.push(v));

    c.setFilterValue('statut', 'SUSPENDU');

    expect(c.valueOf('statut')).toBe('SUSPENDU');
    expect(recu).toEqual([{ statut: 'SUSPENDU' }]);
  });

  it('setFilterValue pousse les query params quand syncUrl est actif', () => {
    const { c, navigate } = setup({ filters: [STATUT], syncUrl: true });
    c.setFilterValue('statut', 'ACTIF');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { f_statut: 'ACTIF' }, queryParamsHandling: 'merge' }),
    );
  });

  it("n'appelle pas le routeur sans syncUrl", () => {
    const { c, navigate } = setup({ filters: [STATUT] });
    c.setFilterValue('statut', 'ACTIF');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hydrate les valeurs initiales depuis l’URL quand syncUrl est actif', () => {
    const { c } = setup({ filters: [STATUT], syncUrl: true, queryParams: { f_statut: 'SUSPENDU' } });
    expect(c.valueOf('statut')).toBe('SUSPENDU');
  });

  it('removeTag efface la valeur du filtre concerné', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    c.removeTag('statut');
    expect(c.valueOf('statut')).toBeNull();
  });

  // ── Effacer tout, avec annulation ─────────────────────────────────────────

  it('clearAll remet tous les filtres à null et émet le résultat', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    const recu: FilterValues[] = [];
    c.valuesChange.subscribe((v) => recu.push(v));

    c.clearAll();

    expect(c.valueOf('statut')).toBeNull();
    expect(recu).toEqual([{ statut: null }]);
  });

  it('clearAll affiche un toast avec une action d’annulation', () => {
    const { c, toastInfo } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    c.clearAll();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const actions = toastInfo.mock.calls[0][2];
    expect(actions).toHaveLength(1);
  });

  it('l’action d’annulation du toast restaure les filtres effacés', () => {
    const { c, toastInfo } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    c.clearAll();
    const undo = toastInfo.mock.calls[0][2][0].handler as () => void;

    undo();

    expect(c.valueOf('statut')).toBe('ACTIF');
  });

  // ── Recherche debouncée ────────────────────────────────────────────────────

  it('émet searchChange immédiatement sans debounce', () => {
    const { c } = setup();
    const recu: string[] = [];
    c.searchChange.subscribe((v) => recu.push(v));
    c.onSearchInput('diallo');
    expect(recu).toEqual(['diallo']);
  });

  it('retarde searchChange du délai configuré', () => {
    vi.useFakeTimers();
    const { c } = setup({ debounceMs: 250 });
    const recu: string[] = [];
    c.searchChange.subscribe((v) => recu.push(v));

    c.onSearchInput('a');
    expect(recu).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(recu).toEqual(['a']);
    vi.useRealTimers();
  });

  it('isDebouncing est vrai tant que le buffer local diverge de la valeur commitée', () => {
    vi.useFakeTimers();
    const { fixture, c } = setup({ debounceMs: 250 });
    c.onSearchInput('a');
    fixture.detectChanges();
    expect(c.isDebouncing()).toBe(true);
    vi.advanceTimersByTime(250);
    vi.useRealTimers();
  });

  // ── Navigation clavier des chips (WAI-ARIA radiogroup) ────────────────────

  it('ArrowRight avance vers l’option suivante, avec retour au début (wrap)', () => {
    const { c } = setup({ filters: [STATUT] });
    const target = { closest: () => null } as unknown as HTMLElement;
    const ev = { key: 'ArrowRight', preventDefault: vi.fn(), currentTarget: { parentElement: null } } as unknown as KeyboardEvent;

    c.onChipKeydown(ev, STATUT, null); // null → ACTIF
    expect(c.valueOf('statut')).toBe('ACTIF');

    c.onChipKeydown(ev, STATUT, 'SUSPENDU'); // dernier → wrap vers null
    expect(c.valueOf('statut')).toBeNull();
    void target;
  });

  it('End sélectionne la dernière option de la séquence', () => {
    const { c } = setup({ filters: [STATUT] });
    const ev = { key: 'End', preventDefault: vi.fn(), currentTarget: { parentElement: null } } as unknown as KeyboardEvent;
    c.onChipKeydown(ev, STATUT, null);
    expect(c.valueOf('statut')).toBe('SUSPENDU');
  });

  it('Home ramène à « Tous » (null) pour un filtre clearable', () => {
    const { c } = setup({ filters: [STATUT] });
    const ev = { key: 'Home', preventDefault: vi.fn(), currentTarget: { parentElement: null } } as unknown as KeyboardEvent;
    c.onChipKeydown(ev, STATUT, 'SUSPENDU');
    expect(c.valueOf('statut')).toBeNull();
  });

  it('une touche non gérée ne modifie rien', () => {
    const { c } = setup({ filters: [STATUT], values: { statut: 'ACTIF' } });
    const ev = { key: 'Tab', preventDefault: vi.fn(), currentTarget: { parentElement: null } } as unknown as KeyboardEvent;
    c.onChipKeydown(ev, STATUT, 'ACTIF');
    expect(c.valueOf('statut')).toBe('ACTIF');
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it('un filtre non-clearable exclut null de la séquence de navigation', () => {
    const { c } = setup({ filters: [{ ...STATUT, clearable: false }] });
    const ev = { key: 'Home', preventDefault: vi.fn(), currentTarget: { parentElement: null } } as unknown as KeyboardEvent;
    c.onChipKeydown(ev, { ...STATUT, clearable: false }, 'SUSPENDU');
    expect(c.valueOf('statut')).toBe('ACTIF'); // jamais null : première option réelle
  });

  // ── Feuille mobile ─────────────────────────────────────────────────────────

  it('openSheet/closeSheet basculent la feuille', () => {
    const { c } = setup();
    expect(c.sheetOpen()).toBe(false);
    c.openSheet();
    expect(c.sheetOpen()).toBe(true);
    c.closeSheet();
    expect(c.sheetOpen()).toBe(false);
  });

  it('hasSecondaryFilters est vrai dès qu’il existe des chips ou des selects', () => {
    const { c } = setup({ filters: [STATUT] });
    expect(c.hasSecondaryFilters()).toBe(true);
  });

  it('hasSecondaryFilters est faux sans aucun filtre', () => {
    const { c } = setup({ filters: [] });
    expect(c.hasSecondaryFilters()).toBe(false);
  });

  // ── Totaux d'options ───────────────────────────────────────────────────────

  it('totalOptions additionne les comptes déclarés', () => {
    const { c } = setup({
      filters: [{ ...STATUT, options: [{ label: 'Actif', value: 'ACTIF', count: 7 }, { label: 'Suspendu', value: 'SUSPENDU', count: 3 }] }],
    });
    expect(c.totalOptions(c.filters()[0])).toBe(10);
  });

  it('totalOptions vaut null quand aucune option ne porte de compte', () => {
    const { c } = setup({ filters: [STATUT] });
    expect(c.totalOptions(c.filters()[0])).toBeNull();
  });
});
