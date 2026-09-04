import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthPasswordPairComponent } from './auth-password-pair.component';

/**
 * Paire mot de passe / confirmation. La correspondance et la longueur minimale
 * (8) sont ce qui garde une inscription valide — les tester en surface ne
 * suffit pas : `confirmPassword` vide doit être neutre (pas encore d'erreur à
 * afficher), pas une correspondance qu'on validerait.
 */
describe('AuthPasswordPairComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AuthPasswordPairComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(AuthPasswordPairComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it('reste neutre (pas de désaccord) quand rien n’a encore été saisi', () => {
    const { component } = setup();
    expect(component.passwordsMatch()).toBe(true);
    expect(component.isValid()).toBe(false); // rien de saisi : pas valide pour autant
  });

  it("ne signale pas de désaccord tant que la confirmation est vide, même si le mot de passe l'est déjà", () => {
    const { component } = setup();
    component.password.set('secret123');
    expect(component.passwordsMatch()).toBe(true);
  });

  it('signale le désaccord dès que la confirmation diverge', () => {
    const { component } = setup();
    component.password.set('secret123');
    component.confirmPassword.set('autrechose');
    expect(component.passwordsMatch()).toBe(false);
  });

  it('redevient valide une fois la confirmation alignée', () => {
    const { component } = setup();
    component.password.set('secret123');
    component.confirmPassword.set('secret123');
    expect(component.passwordsMatch()).toBe(true);
  });

  it('exige au moins 8 caractères pour être valide, même si les deux concordent', () => {
    const { component } = setup();
    component.password.set('abc');
    component.confirmPassword.set('abc');
    expect(component.passwordsMatch()).toBe(true);
    expect(component.isValid()).toBe(false);
  });

  it('est valide à 8 caractères exactement, identiques', () => {
    const { component } = setup();
    component.password.set('12345678');
    component.confirmPassword.set('12345678');
    expect(component.isValid()).toBe(true);
  });

  it('affiche le message de désaccord dans le gabarit quand les mots de passe divergent', () => {
    const { fixture, component, racine } = setup();
    component.password.set('secret123');
    component.confirmPassword.set('autrechose');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeTruthy();
  });

  it("n'affiche aucun message tant que la confirmation est vide", () => {
    const { fixture, component, racine } = setup();
    component.password.set('secret123');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeNull();
  });

  it('utilise les ids personnalisés pour les deux champs mot de passe', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('newPasswordId', 'pwd-1');
    fixture.componentRef.setInput('confirmPasswordId', 'pwd-2');
    fixture.detectChanges();
    // `app-auth-field` enveloppe le contrôle (label implicite, pas de `for`) :
    // l'id se vérifie sur l'`<input>` réel que `p-password` rend en son sein.
    expect(racine.querySelector('#pwd-1')).toBeTruthy();
    expect(racine.querySelector('#pwd-2')).toBeTruthy();
  });

  it('utilise les libellés personnalisés', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('newPasswordLabel', 'Nouveau code secret');
    fixture.componentRef.setInput('confirmPasswordLabel', 'Confirmez le code secret');
    fixture.detectChanges();
    expect(racine.textContent).toContain('Nouveau code secret');
    expect(racine.textContent).toContain('Confirmez le code secret');
  });
});
