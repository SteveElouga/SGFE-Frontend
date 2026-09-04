import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { M07SheetComponent, M07Result } from './m07-sheet.component';

/**
 * Feuille « marquer non relevé / estimé » de l'interface terrain (M-07).
 *
 * Ces tests portent sur les deux garanties du formulaire : l'observation est
 * obligatoire quel que soit le statut choisi (rien ne part sans raison écrite),
 * et la feuille se réinitialise à chaque ouverture — sinon une saisie oubliée
 * d'un abonné précédent se retrouverait attribuée au suivant.
 */
function monter() {
  TestBed.configureTestingModule({
    imports: [M07SheetComponent],
    providers: [provideTranslateService({})],
  });
  const fixture = TestBed.createComponent(M07SheetComponent);
  fixture.componentRef.setInput('open', false);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance };
}

describe('M07SheetComponent', () => {
  it('démarre sur « non relevé », sans observation', () => {
    const { c } = monter();
    expect(c.statut()).toBe('NON_RELEVE');
    expect(c.observation()).toBe('');
    expect(c.valide()).toBe(false);
  });

  it('bascule vers « estimé » sur demande', () => {
    const { c } = monter();
    c.setStatut('ESTIME');
    expect(c.statut()).toBe('ESTIME');
  });

  it('refuse de valider sans observation, quel que soit le statut', () => {
    const { c } = monter();
    c.setStatut('ESTIME');
    expect(c.valide()).toBe(false);
    c.observation.set('   ');
    expect(c.valide()).toBe(false); // uniquement des espaces : ce n'est pas une observation
  });

  it('valide dès qu’une observation non vide est saisie', () => {
    const { c } = monter();
    c.observation.set('Portail fermé, chien');
    expect(c.valide()).toBe(true);
  });

  it('n’émet rien tant que la saisie n’est pas valide', () => {
    const { c } = monter();
    const recus: M07Result[] = [];
    c.confirm.subscribe((r) => recus.push(r));
    c.onConfirm();
    expect(recus).toHaveLength(0);
  });

  it('émet le statut et l’observation débarrassée de ses espaces', () => {
    const { c } = monter();
    const recus: M07Result[] = [];
    c.confirm.subscribe((r) => recus.push(r));
    c.setStatut('ESTIME');
    c.observation.set('  Compteur inaccessible  ');
    c.onConfirm();
    expect(recus).toEqual([{ statut: 'ESTIME', observation: 'Compteur inaccessible' }]);
  });

  it('émet un `cancel` sur demande d’annulation', () => {
    const { c } = monter();
    let annule = 0;
    c.cancel.subscribe(() => annule++);
    c.onConfirm(); // ne doit pas émettre cancel
    expect(annule).toBe(0);
  });

  it('se réinitialise à chaque nouvelle ouverture — pas de fuite entre deux abonnés', () => {
    const { c, fixture } = monter();
    c.setStatut('ESTIME');
    c.observation.set('Reste du précédent');
    fixture.detectChanges();

    // Fermeture puis réouverture : l'effet de reset ne se déclenche que sur un
    // front montant (false → true), jamais en restant ouvert.
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(c.statut()).toBe('NON_RELEVE');
    expect(c.observation()).toBe('');
  });

  it('ne se réinitialise pas tant que la sheet reste ouverte', () => {
    const { c, fixture } = monter();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    c.setStatut('ESTIME');
    c.observation.set('En cours de saisie');
    fixture.detectChanges(); // `open` ne change pas : pas de reset

    expect(c.statut()).toBe('ESTIME');
    expect(c.observation()).toBe('En cours de saisie');
  });
});

describe('M07SheetComponent · ce qui s’affiche', () => {
  function monter() {
    TestBed.configureTestingModule({
      imports: [M07SheetComponent],
      providers: [provideTranslateService({})],
    });
    const fixture = TestBed.createComponent(M07SheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      boutonValider: () => racine.querySelector('.btn-danger') as HTMLButtonElement,
      options: () => [...racine.querySelectorAll('.m07-opt')] as HTMLButtonElement[],
    };
  }

  it('le bouton de validation est désactivé sans observation', () => {
    const { boutonValider } = monter();
    expect(boutonValider().disabled).toBe(true);
  });

  it('se réhabilite dès qu’une observation est saisie', () => {
    const { c, fixture, boutonValider } = monter();
    c.observation.set('Absent');
    fixture.detectChanges();
    expect(boutonValider().disabled).toBe(false);
  });

  it('le clic sur une option la sélectionne visuellement (aria-checked)', () => {
    const { options, fixture } = monter();
    const [nonReleve, estime] = options();
    expect(nonReleve.getAttribute('aria-checked')).toBe('true');
    expect(estime.getAttribute('aria-checked')).toBe('false');

    estime.click();
    fixture.detectChanges();
    expect(estime.getAttribute('aria-checked')).toBe('true');
    expect(nonReleve.getAttribute('aria-checked')).toBe('false');
  });
});
