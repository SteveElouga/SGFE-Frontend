import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthMobileNavComponent } from './auth-mobile-nav.component';

/**
 * Barre de navigation mobile des écrans d'auth : titre + retour.
 */
describe('AuthMobileNavComponent', () => {
  function setup(backTo?: string) {
    TestBed.configureTestingModule({
      imports: [AuthMobileNavComponent],
      providers: [provideRouter([]), provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(AuthMobileNavComponent);
    fixture.componentRef.setInput('title', 'Connexion');
    if (backTo !== undefined) fixture.componentRef.setInput('backTo', backTo);
    fixture.detectChanges();
    return { racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le titre fourni', () => {
    const { racine } = setup();
    expect(racine.querySelector('.auth-mobile-nav__title')?.textContent).toBe('Connexion');
  });

  it('revient à /login par défaut', () => {
    const { racine } = setup();
    const lien = racine.querySelector('a.auth-mobile-nav__back') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/login');
  });

  it('suit une destination de retour personnalisée', () => {
    const { racine } = setup('/otp');
    const lien = racine.querySelector('a.auth-mobile-nav__back') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/otp');
  });
});
