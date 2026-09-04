import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { FilterChip, FilterChipsComponent } from './filter-chips.component';

describe('FilterChipsComponent', () => {
  const OPTIONS: FilterChip[] = [
    { label: 'Actif', value: 'ACTIF', count: 12 },
    { label: 'Suspendu', value: 'SUSPENDU', count: 3 },
  ];

  function setup(inputs: Partial<{
    options: FilterChip[];
    value: string | null;
    total: number | null;
    groupLabel: string | null;
    translateLabels: boolean;
  }> = {}) {
    TestBed.configureTestingModule({
      imports: [FilterChipsComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { COMMON: { ALL: 'Tous' }, ABONNES: { ACTIF: 'Actif' } });
    translate.use('fr');

    const fixture = TestBed.createComponent(FilterChipsComponent);
    fixture.componentRef.setInput('options', inputs.options ?? OPTIONS);
    if (inputs.value !== undefined) fixture.componentRef.setInput('value', inputs.value);
    if (inputs.total !== undefined) fixture.componentRef.setInput('total', inputs.total);
    if (inputs.groupLabel !== undefined) fixture.componentRef.setInput('groupLabel', inputs.groupLabel);
    if (inputs.translateLabels !== undefined) fixture.componentRef.setInput('translateLabels', inputs.translateLabels);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche une pilule « Tous » suivie d’une pilule par option', () => {
    const { racine } = setup();
    const chips = [...racine.querySelectorAll('.fchips__chip')];
    expect(chips).toHaveLength(3);
    expect(chips[0].textContent).toContain('Tous');
    expect(chips[1].textContent).toContain('Actif');
    expect(chips[2].textContent).toContain('Suspendu');
  });

  it('marque active la pilule correspondant à value', () => {
    const { racine } = setup({ value: 'SUSPENDU' });
    const chips = [...racine.querySelectorAll('.fchips__chip')];
    expect(chips[0].classList.contains('fchips__chip--active')).toBe(false);
    expect(chips[2].classList.contains('fchips__chip--active')).toBe(true);
  });

  it('marque « Tous » actif quand value est null', () => {
    const { racine } = setup({ value: null });
    expect(racine.querySelector('.fchips__chip')?.classList.contains('fchips__chip--active')).toBe(true);
  });

  it('affiche le total sur « Tous » seulement s’il est fourni', () => {
    const { racine: avecTotal } = setup({ total: 42 });
    expect(avecTotal.querySelector('.fchips__chip')?.textContent).toContain('(42)');
  });

  it('masque le compteur de « Tous » quand total vaut null', () => {
    const { racine } = setup({ total: null });
    expect(racine.querySelector('.fchips__chip')?.textContent).not.toContain('(');
  });

  it('affiche le compteur de chaque option quand il est fourni', () => {
    const { racine } = setup();
    const chips = [...racine.querySelectorAll('.fchips__chip')];
    expect(chips[1].textContent).toContain('(12)');
    expect(chips[2].textContent).toContain('(3)');
  });

  it('n’affiche pas de compteur pour une option qui n’en porte pas', () => {
    const { racine } = setup({ options: [{ label: 'Tous quartiers', value: 'X' }] });
    const chip = racine.querySelectorAll('.fchips__chip')[1];
    expect(chip.textContent).not.toContain('(');
  });

  it('émet valueChange avec la valeur de l’option cliquée', () => {
    const { fixture, racine } = setup();
    const recu: (string | null)[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => recu.push(v));
    (racine.querySelectorAll('.fchips__chip')[2] as HTMLButtonElement).click();
    expect(recu).toEqual(['SUSPENDU']);
  });

  it('émet null au clic sur « Tous »', () => {
    const { fixture, racine } = setup({ value: 'ACTIF' });
    const recu: (string | null)[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => recu.push(v));
    (racine.querySelectorAll('.fchips__chip')[0] as HTMLButtonElement).click();
    expect(recu).toEqual([null]);
  });

  it('traite les labels comme des clés i18n quand translateLabels est actif', () => {
    const { racine } = setup({
      options: [{ label: 'ABONNES.ACTIF', value: 'ACTIF' }],
      translateLabels: true,
    });
    const chip = racine.querySelectorAll('.fchips__chip')[1];
    expect(chip.textContent).toContain('Actif');
    expect(chip.textContent).not.toContain('ABONNES.ACTIF');
  });

  it('affiche les labels tels quels par défaut (sans traduction)', () => {
    const { racine } = setup({ options: [{ label: 'ABONNES.ACTIF', value: 'ACTIF' }] });
    const chip = racine.querySelectorAll('.fchips__chip')[1];
    expect(chip.textContent).toContain('ABONNES.ACTIF');
  });

  it('relie le groupe à son étiquette via aria-labelledby quand groupLabel est fourni', () => {
    const { racine } = setup({ groupLabel: 'COMMON.ALL' });
    const tablist = racine.querySelector('[role="tablist"]');
    const legende = racine.querySelector('.fchips__legende');
    expect(legende).toBeTruthy();
    expect(tablist?.getAttribute('aria-labelledby')).toBe(legende?.id);
    expect(tablist?.hasAttribute('aria-label')).toBe(false);
  });

  it('retombe sur aria-label (sans légende visible) quand groupLabel est absent', () => {
    const { racine } = setup();
    const tablist = racine.querySelector('[role="tablist"]');
    expect(racine.querySelector('.fchips__legende')).toBeNull();
    expect(tablist?.getAttribute('aria-label')).toBe('Tous');
  });
});
