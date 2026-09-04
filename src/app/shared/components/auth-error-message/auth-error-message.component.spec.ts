import { TestBed } from '@angular/core/testing';
import { AuthErrorMessageComponent } from './auth-error-message.component';

/**
 * Message d'erreur des écrans d'auth. Il suit une action refusée et doit
 * s'annoncer (`role="alert"`) — mais seulement quand il y a effectivement un
 * message : un `role="alert"` posé sur un hôte vide s'annoncerait quand même
 * au moindre changement de style.
 */
describe('AuthErrorMessageComponent', () => {
  function setup(text: string | null = null) {
    TestBed.configureTestingModule({ imports: [AuthErrorMessageComponent] });
    const fixture = TestBed.createComponent(AuthErrorMessageComponent);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('se masque et ne montre rien sans message', () => {
    const { racine } = setup(null);
    expect(racine.style.display).toBe('none');
    expect(racine.querySelector('span')).toBeNull();
    expect(racine.querySelector('svg')).toBeNull();
  });

  it('se montre et affiche le message avec son icône', () => {
    const { racine } = setup('Identifiants incorrects.');
    expect(racine.style.display).toBe('flex');
    expect(racine.querySelector('span')?.textContent).toBe('Identifiants incorrects.');
    expect(racine.querySelector('svg')).toBeTruthy();
  });

  it('porte le rôle alert pour être annoncé aux lecteurs d’écran', () => {
    const { racine } = setup('Erreur');
    expect(racine.getAttribute('role')).toBe('alert');
  });

  it('une chaîne vide reste traitée comme absence de message', () => {
    const { racine } = setup('');
    expect(racine.style.display).toBe('none');
  });
});
