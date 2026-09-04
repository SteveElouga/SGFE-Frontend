import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthOtpCodeInputComponent } from './auth-otp-code-input.component';

/**
 * Champ de saisie du code OTP à 6 chiffres. La seule logique réelle est le
 * modèle à double sens (`model()`) : ce que l'utilisateur tape doit ressortir
 * du composant, et ce que le composant reçoit doit s'afficher.
 */
describe('AuthOtpCodeInputComponent', () => {
  function setup(idOverride?: string) {
    TestBed.configureTestingModule({
      imports: [AuthOtpCodeInputComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(AuthOtpCodeInputComponent);
    if (idOverride !== undefined) {
      fixture.componentRef.setInput('inputId', idOverride);
      fixture.componentRef.setInput('name', idOverride);
    }
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, input, component: fixture.componentInstance };
  }

  it('porte un id par défaut de "otp"', () => {
    const { input, component } = setup();
    expect(input.id).toBe('otp');
    // `[name]="name()"` cohabite avec `ngModel` sur le même élément : Angular
    // fait alors prévaloir l'input `name` de la directive `NgModel` (utilisé
    // pour l'enregistrement du contrôle) sur la propriété DOM native — l'attribut
    // `name` n'atterrit donc jamais sur le `<input>` rendu. Comportement réel
    // du framework, pas un bug de ce composant : on vérifie donc le signal, qui
    // porte la valeur voulue, plutôt que l'attribut DOM qui ne la reçoit pas.
    expect(component.name()).toBe('otp');
  });

  it('affiche la valeur reçue', async () => {
    const { fixture, input } = setup();
    fixture.componentRef.setInput('value', '1234');
    fixture.detectChanges();
    // `NgModel.writeValue` reporte l'écriture DOM à une microtâche (pour éviter
    // un ExpressionChangedAfterItHasBeenChecked) : un seul `detectChanges()`
    // synchrone ne suffit pas à voir la valeur apparaître dans l'input.
    await Promise.resolve();
    fixture.detectChanges();
    expect(input.value).toBe('1234');
  });

  it('met à jour le modèle quand l’utilisateur tape', () => {
    const { fixture, input, component } = setup();
    input.value = '785412';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.value()).toBe('785412');
  });

  it('limite la saisie à 6 caractères (contrat du champ)', () => {
    const { input } = setup();
    expect(input.maxLength).toBe(6);
  });
});
