import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthBackLinkComponent } from './auth-back-link.component';

/**
 * Lien de retour des écrans d'authentification. Peu de logique, mais trois
 * choses qui doivent rester vraies : la destination par défaut, le libellé
 * par défaut, et la classe qui le masque en mobile.
 */
describe('AuthBackLinkComponent', () => {
  function setup(inputs: Partial<{ to: string; label: string; desktopOnly: boolean }> = {}) {
    TestBed.configureTestingModule({
      imports: [AuthBackLinkComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(AuthBackLinkComponent);
    if (inputs.to !== undefined) fixture.componentRef.setInput('to', inputs.to);
    if (inputs.label !== undefined) fixture.componentRef.setInput('label', inputs.label);
    if (inputs.desktopOnly !== undefined) fixture.componentRef.setInput('desktopOnly', inputs.desktopOnly);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('pointe vers /login et affiche le libellé par défaut', () => {
    const { racine } = setup();
    const lien = racine.querySelector('a.auth-back-link') as HTMLAnchorElement;
    expect(lien).toBeTruthy();
    expect(lien.getAttribute('href')).toBe('/login');
    expect(racine.textContent).toContain('Retour à la connexion');
  });

  it('suit une destination et un libellé personnalisés', () => {
    const { racine } = setup({ to: '/otp', label: 'Retour au code' });
    const lien = racine.querySelector('a.auth-back-link') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/otp');
    expect(racine.textContent).toContain('Retour au code');
  });

  it("ne porte pas la classe masquée par défaut", () => {
    const { racine } = setup();
    expect(racine.classList.contains('auth-back-link--desktop-only')).toBe(false);
  });

  it('porte la classe qui le masque en mobile quand demandé', () => {
    const { racine } = setup({ desktopOnly: true });
    expect(racine.classList.contains('auth-back-link--desktop-only')).toBe(true);
  });
});
