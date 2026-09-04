import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthPhoneInputComponent } from './auth-phone-input.component';

/**
 * Numéro local camerounais : 8 à 15 chiffres, sans le préfixe +237 (affiché à
 * part). L'erreur ne doit apparaître qu'une fois que l'abonné a commencé à
 * taper — un champ vide n'est pas une erreur, juste un champ pas encore rempli.
 */
describe('AuthPhoneInputComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AuthPhoneInputComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(AuthPhoneInputComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it('un champ vide ne signale aucune erreur (rien saisi, pas une erreur)', () => {
    const { component } = setup();
    expect(component.isValid()).toBe(false);
    expect(component.showError()).toBe(false);
  });

  it('un numéro de 8 chiffres est valide', () => {
    const { component } = setup();
    component.value.set('12345678');
    expect(component.isValid()).toBe(true);
    expect(component.showError()).toBe(false);
  });

  it('un numéro trop court (moins de 8 chiffres) est signalé en erreur', () => {
    const { component } = setup();
    component.value.set('1234567');
    expect(component.isValid()).toBe(false);
    expect(component.showError()).toBe(true);
  });

  it('des lettres ou des espaces internes invalident le numéro', () => {
    const { component } = setup();
    component.value.set('612 345a');
    expect(component.isValid()).toBe(false);
    expect(component.showError()).toBe(true);
  });

  it('ignore les espaces en début/fin de saisie', () => {
    const { component } = setup();
    component.value.set('  612345678  ');
    expect(component.isValid()).toBe(true);
  });

  it('accepte jusqu’à 15 chiffres', () => {
    const { component } = setup();
    component.value.set('123456789012345');
    expect(component.isValid()).toBe(true);
  });

  it('refuse au-delà de 15 chiffres', () => {
    const { component } = setup();
    component.value.set('1234567890123456');
    expect(component.isValid()).toBe(false);
  });

  it('affiche le préfixe +237 et la classe d’erreur dans le gabarit', () => {
    const { fixture, component, racine } = setup();
    expect(racine.querySelector('.auth-phone-field__prefix')?.textContent).toContain('+237');

    component.value.set('123');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-phone-field--invalid')).toBeTruthy();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeTruthy();
  });

  it('affiche la classe valide sans message d’erreur pour un numéro correct', () => {
    const { fixture, component, racine } = setup();
    component.value.set('612345678');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-phone-field--valid')).toBeTruthy();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeNull();
  });
});
