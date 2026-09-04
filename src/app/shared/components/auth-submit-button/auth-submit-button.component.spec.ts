import { TestBed } from '@angular/core/testing';
import { AuthSubmitButtonComponent } from './auth-submit-button.component';

/**
 * Bouton de soumission des formulaires d'auth — une fine enveloppe autour de
 * `p-button`. Ce qui compte : le libellé et l'état chargement/désactivé
 * atteignent bien le bouton réel.
 */
describe('AuthSubmitButtonComponent', () => {
  function setup(inputs: Partial<{ label: string; loading: boolean; disabled: boolean }> = {}) {
    TestBed.configureTestingModule({ imports: [AuthSubmitButtonComponent] });
    const fixture = TestBed.createComponent(AuthSubmitButtonComponent);
    fixture.componentRef.setInput('label', inputs.label ?? 'Se connecter');
    if (inputs.loading !== undefined) fixture.componentRef.setInput('loading', inputs.loading);
    if (inputs.disabled !== undefined) fixture.componentRef.setInput('disabled', inputs.disabled);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le libellé fourni sur un bouton de type submit', () => {
    const { racine } = setup({ label: 'Créer le compte' });
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton).toBeTruthy();
    expect(bouton.type).toBe('submit');
    expect(racine.textContent).toContain('Créer le compte');
  });

  it("n'est pas désactivé ni en chargement par défaut", () => {
    const { racine } = setup();
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
    expect(racine.querySelector('.p-button-loading')).toBeNull();
  });

  it('se désactive quand demandé', () => {
    const { racine } = setup({ disabled: true });
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('affiche l’état chargement (et se désactive avec)', () => {
    const { racine } = setup({ loading: true });
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(racine.querySelector('.p-button-loading-icon, .pi-spinner')).toBeTruthy();
  });
});
