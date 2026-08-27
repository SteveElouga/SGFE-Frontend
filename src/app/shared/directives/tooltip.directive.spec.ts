import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TooltipDirective } from './tooltip.directive';

/**
 * Le délai d'ouverture protège d'un effet indésirable : qu'un simple passage de
 * souris fasse surgir des panneaux sur tout le trajet du curseur. Il ne vaut
 * que pour le premier. Une fois qu'un tooltip s'est ouvert, l'utilisateur a
 * montré qu'il cherchait des explications, et parcourir une barre d'icônes en
 * repayant 300 ms à chaque bouton donne à toute la barre un air d'application
 * lente.
 */
@Component({
  imports: [TooltipDirective],
  template: `
    <button type="button" id="a" [appTooltip]="'Suspendre'" tooltipPosition="top">A</button>
    <button type="button" id="b" [appTooltip]="'Résilier'" tooltipPosition="bottom">B</button>
    <button type="button" id="muet" [appTooltip]="''">C</button>
  `,
})
class HoteTest {}

function panneaux(): HTMLElement[] {
  return [...document.querySelectorAll('.aq-tooltip')] as HTMLElement[];
}

describe('TooltipDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HoteTest>>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [HoteTest] });
    fixture = TestBed.createComponent(HoteTest);
    fixture.detectChanges();
  });

  afterEach(() => {
    // Referme par le geste, pas en arrachant le nœud : la fenêtre
    // d'enchaînement est statique, donc partagée entre les tests, et seule la
    // fermeture par la directive la programme.
    fixture.nativeElement.querySelectorAll('button').forEach((b: HTMLElement) => {
      b.dispatchEvent(new MouseEvent('mouseleave'));
      b.dispatchEvent(new FocusEvent('blur'));
    });
    vi.advanceTimersByTime(5000);
    panneaux().forEach((p) => p.remove());
    vi.useRealTimers();
  });

  function bouton(id: string): HTMLElement {
    return fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
  }

  it('n’ouvre rien avant le délai', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(299);
    expect(panneaux()).toHaveLength(0);
  });

  it('ouvre après le délai, avec le texte demandé', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);
    expect(panneaux()).toHaveLength(1);
    expect(panneaux()[0].textContent).toBe('Suspendre');
  });

  it('le voisin s’ouvre sans délai — c’est ce qui rend une barre parcourable', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);
    bouton('a').dispatchEvent(new MouseEvent('mouseleave'));

    bouton('b').dispatchEvent(new MouseEvent('mouseenter'));
    // Aucun temps écoulé : le panneau est déjà là.
    expect(panneaux()).toHaveLength(1);
    expect(panneaux()[0].textContent).toBe('Résilier');
  });

  it('et sans rejouer l’animation', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);
    expect(panneaux()[0].hasAttribute('data-instantane')).toBe(false);
    bouton('a').dispatchEvent(new MouseEvent('mouseleave'));

    bouton('b').dispatchEvent(new MouseEvent('mouseenter'));
    expect(panneaux()[0].hasAttribute('data-instantane')).toBe(true);
  });

  it('un retour bien plus tard repart du délai', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);
    bouton('a').dispatchEvent(new MouseEvent('mouseleave'));

    // Au-delà de la fenêtre d'enchaînement, on n'est plus « en mode explication ».
    vi.advanceTimersByTime(1200);

    bouton('b').dispatchEvent(new MouseEvent('mouseenter'));
    expect(panneaux()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(panneaux()).toHaveLength(1);
  });

  it('le focus clavier ouvre immédiatement', () => {
    bouton('a').dispatchEvent(new FocusEvent('focus'));
    expect(panneaux()).toHaveLength(1);
    expect(panneaux()[0].textContent).toBe('Suspendre');
  });

  it('le blur referme', () => {
    bouton('a').dispatchEvent(new FocusEvent('focus'));
    bouton('a').dispatchEvent(new FocusEvent('blur'));
    expect(panneaux()).toHaveLength(0);
  });

  it('l’origine suit le côté d’apparition', () => {
    bouton('a').dispatchEvent(new FocusEvent('focus'));
    expect(panneaux()[0].style.transformOrigin).toBe('center bottom');
    bouton('a').dispatchEvent(new FocusEvent('blur'));

    bouton('b').dispatchEvent(new FocusEvent('focus'));
    expect(panneaux()[0].style.transformOrigin).toBe('center top');
  });

  it('quitter avant le délai annule l’ouverture', () => {
    bouton('a').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(150);
    bouton('a').dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(500);
    expect(panneaux()).toHaveLength(0);
  });

  it('un texte vide n’ouvre jamais rien', () => {
    bouton('muet').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(500);
    bouton('muet').dispatchEvent(new FocusEvent('focus'));
    expect(panneaux()).toHaveLength(0);
  });

  it('le clic referme — on a agi, on n’a plus besoin de l’explication', () => {
    bouton('a').dispatchEvent(new FocusEvent('focus'));
    expect(panneaux()).toHaveLength(1);
    bouton('a').dispatchEvent(new MouseEvent('click'));
    expect(panneaux()).toHaveLength(0);
  });

  it('un hôte à icône seule reçoit le texte comme nom accessible', () => {
    expect(bouton('a').getAttribute('aria-label')).toBeNull(); // il a déjà du texte
    const muet = bouton('muet');
    expect(muet.getAttribute('aria-label')).toBeNull(); // texte vide → rien à nommer
  });
});
