import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
  const mutateSpy = vi.fn();

  TestBed.configureTestingModule({
    imports: [ForgotPasswordComponent],
    providers: [
      provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),provideRouter([]), { provide: Apollo, useValue: { mutate: mutateSpy } }],
  });

  const fixture = TestBed.createComponent(ForgotPasswordComponent);
  return { fixture, component: fixture.componentInstance, mutateSpy };
}

describe('ForgotPasswordComponent', () => {

  it('should create the component', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('disables the email submit until a valid email is entered', () => {
    const { component } = setup();
    expect(component.canSubmitEmail()).toBe(false);

    component.email.set('admin@aquabill.test');
    expect(component.canSubmitEmail()).toBe(true);
  });

  it('shows the success state once the request completes, even for an unknown email', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: { requestPasswordReset: true } }));

    component.email.set('unknown@aquabill.test');
    await component.onSubmitEmail();

    expect(component.emailSubmitted()).toBe(true);
    expect(component.emailErrorType()).toBeNull();
  });

  it('sets a generic error on a network/server failure', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('network error')));

    component.email.set('admin@aquabill.test');
    await component.onSubmitEmail();

    expect(component.emailSubmitted()).toBe(false);
    expect(component.emailErrorType()).toBe('generic');
  });
});

/**
 * Les tests ci-dessus n'appellent jamais `detectChanges()` : le template (les
 * deux onglets, leurs sous-étapes, les écrans de succès) n'est donc jamais
 * réellement rendu. Les blocs suivants le rendent pour de bon et déclenchent
 * de vraies interactions DOM (clic, saisie, soumission de formulaire).
 */
describe('ForgotPasswordComponent — rendu du template', () => {
  function monter() {
    const { fixture, component, mutateSpy } = setup();
    fixture.detectChanges();
    return { fixture, c: component, mutateSpy, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche l’onglet WhatsApp (étape téléphone) par défaut, pas l’onglet email', () => {
    const { racine } = monter();
    expect(racine.querySelector('.forgot-password__form')).toBeTruthy();
    expect(racine.textContent).not.toContain('FORGOT.EMAIL_TITRE');
    expect(racine.textContent).toContain('FORGOT.WA_TITRE');
  });

  it('un clic réel sur "Administrateur ? Par email" bascule vers l’onglet email', () => {
    const { fixture, racine } = monter();
    const lienEmail = Array.from(racine.querySelectorAll('button.fp-admin-link__btn')).find((b) =>
      b.textContent?.includes('AUTH.PAR_EMAIL'),
    ) as HTMLButtonElement;
    expect(lienEmail).toBeTruthy();

    lienEmail.click();
    fixture.detectChanges();

    expect(racine.textContent).toContain('FORGOT.EMAIL_TITRE');
    expect(racine.querySelector('.forgot-password__form input#email')).toBeTruthy();
  });

  it('un clic réel sur "Retour WhatsApp" depuis l’onglet email revient à l’onglet WhatsApp', () => {
    const { fixture, c, racine } = monter();
    c.switchTab('email');
    fixture.detectChanges();

    const retour = racine.querySelector<HTMLButtonElement>('.fp-admin-link__btn')!;
    retour.click();
    fixture.detectChanges();

    expect(c.activeTab()).toBe('whatsapp');
    expect(racine.textContent).toContain('FORGOT.WA_TITRE');
  });

  it('la saisie réelle d’un email invalide affiche l’indice d’erreur, un email valide le masque', async () => {
    const { fixture, c, racine } = monter();
    c.switchTab('email');
    fixture.detectChanges();
    // Le `<form>` de l'onglet email vient d'être créé : `NgForm` enregistre son
    // `NgModel` enfant via une micro-tâche différée (`resolvedPromise.then(...)`
    // dans @angular/forms) — sans ce flush, le value accessor de l'input n'est
    // pas encore branché et l'événement DOM ci-dessous serait ignoré.
    await flush();

    const input = racine.querySelector<HTMLInputElement>('#email')!;
    input.value = 'pas-un-email';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeTruthy();
    expect(c.email()).toBe('pas-un-email');

    input.value = 'admin@sgfe.test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeNull();
  });

  it('soumission réelle du formulaire email : appelle requestPasswordReset puis affiche le succès avec l’email masqué', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(of({ data: { requestPasswordReset: true } }));
    c.switchTab('email');
    c.email.set('administrateur@sgfe.test');
    fixture.detectChanges();

    const form = racine.querySelector('form.forgot-password__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { email: 'administrateur@sgfe.test' } }),
    );
    expect(racine.querySelector('form.forgot-password__form')).toBeNull();
    expect(racine.textContent).toContain('adm···@sgfe.test');
    expect(racine.querySelector('a.auth-screen__gmail-btn')).toBeTruthy();
  });

  it('un clic réel sur "Renvoyer" depuis l’écran de succès resoumet la demande', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(of({ data: { requestPasswordReset: true } }));
    c.switchTab('email');
    c.email.set('admin@sgfe.test');
    await c.onSubmitEmail();
    fixture.detectChanges();

    const renvoyer = racine.querySelector<HTMLButtonElement>('.auth-screen__resend-btn')!;
    renvoyer.click();
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledTimes(2);
  });

  it('un échec de la demande email affiche le message d’erreur générique et garde le formulaire', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(throwError(() => new Error('network down')));
    c.switchTab('email');
    c.email.set('admin@sgfe.test');
    fixture.detectChanges();

    const form = racine.querySelector('form.forgot-password__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.style.display).toBe('flex');
    expect(errorHost.textContent).toContain('Une erreur est survenue. Veuillez réessayer.');
    expect(racine.querySelector('form.forgot-password__form')).toBeTruthy();
  });

  it('saisir le téléphone puis le code/mot de passe via les VRAIS champs imbriqués ([(value)]) met à jour les signaux parents', async () => {
    const { fixture, c, racine } = monter();

    // Étape téléphone : `app-auth-phone-input` expose son <input id="phone">
    // interne — on y tape directement, ce qui exerce le sens "retour" de son
    // `[(value)]` vers le signal `phone` du parent.
    const champTel = racine.querySelector<HTMLInputElement>('#phone')!;
    expect(champTel).toBeTruthy();
    champTel.value = '612345678';
    champTel.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(c.phone()).toBe('612345678');

    // Étape code : mêmes vérifications sur `app-auth-otp-code-input` et sur
    // les deux champs `p-password` imbriqués dans `app-auth-password-pair`.
    c.whatsappStep.set('otp');
    fixture.detectChanges();

    const champOtp = racine.querySelector<HTMLInputElement>('#otp')!;
    const champMdp = racine.querySelector<HTMLInputElement>('#new-password')!;
    const champConfirm = racine.querySelector<HTMLInputElement>('#confirm-password')!;
    expect(champOtp).toBeTruthy();
    expect(champMdp).toBeTruthy();
    expect(champConfirm).toBeTruthy();

    champOtp.value = '123456';
    champOtp.dispatchEvent(new Event('input', { bubbles: true }));
    champMdp.value = 'longenough1';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    champConfirm.value = 'longenough1';
    champConfirm.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.otpCode()).toBe('123456');
    expect(c.newPassword()).toBe('longenough1');
    expect(c.confirmPassword()).toBe('longenough1');
  });

  it('soumission réelle du formulaire téléphone : appelle requestPhoneOtp puis passe à l’étape code', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(of({ data: { requestPhoneOtp: { maskedPhone: '+237 6XX XX 12 34' } } }));
    c.phone.set('612345678');
    fixture.detectChanges();

    const form = racine.querySelector('form.forgot-password__form')!;
    expect(form).toBeTruthy();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { phoneNumber: '+237612345678' } }),
    );
    expect(c.whatsappStep()).toBe('otp');
    expect(racine.textContent).toContain('+237 6XX XX 12 34');
    expect(racine.querySelector('app-auth-otp-code-input')).toBeTruthy();
    expect(racine.querySelector('app-auth-password-pair')).toBeTruthy();
  });

  it('un échec d’envoi WhatsApp (SERVICE_UNAVAILABLE) affiche le message dédié et reste à l’étape téléphone', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'panne', extensions: { code: 'SERVICE_UNAVAILABLE' } }])),
    );
    c.phone.set('612345678');
    fixture.detectChanges();

    const form = racine.querySelector('form.forgot-password__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(c.whatsappStep()).toBe('phone');
    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.textContent).toContain("Échec de l'envoi WhatsApp. Réessayez dans quelques instants.");
  });

  it('soumission réelle du formulaire code : appelle verifyOtpAndSetPassword puis affiche l’écran de succès WhatsApp', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(of({ data: { verifyOtpAndSetPassword: true } }));
    c.phone.set('612345678');
    c.whatsappStep.set('otp');
    c.otpCode.set('123456');
    c.newPassword.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    const form = racine.querySelector('form.forgot-password__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { phoneNumber: '+237612345678', otpCode: '123456', password: 'longenough1' },
      }),
    );
    expect(racine.querySelector('form.forgot-password__form')).toBeNull();
    expect(racine.textContent).toContain('AUTH.SUCCES_CONNEXION');
    expect(racine.querySelector('a[routerLink="/login"]')).toBeTruthy();
  });

  it('un clic réel sur "Renvoyer" (via app-auth-otp-resend) relance requestPhoneOtp', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(of({ data: { requestPhoneOtp: { maskedPhone: '+237 6XX XX 00 00' } } }));
    c.phone.set('612345678');
    c.whatsappStep.set('otp');
    fixture.detectChanges();

    const boutonRenvoyer = racine.querySelector<HTMLButtonElement>('app-auth-otp-resend button');
    expect(boutonRenvoyer).toBeTruthy();
    boutonRenvoyer!.click();
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { phoneNumber: '+237612345678' } }),
    );
  });
});

/**
 * Chemins d'erreur non exercés par les tests précédents : `onResendOtp` et
 * `onSubmitOtp` n'y échouaient jamais, et `maskEmail` n'y voyait jamais un
 * email sans domaine ni une partie locale de 2 caractères ou moins. Appels de
 * méthode directs (comme le reste de ce fichier hors rendu) : ce sont des
 * chemins d'erreur du service, pas des interactions DOM.
 */
describe('ForgotPasswordComponent — chemins d’erreur restants', () => {
  it('onSubmitEmail ne fait rien tant que l’email est invalide (garde `!canSubmitEmail()`)', async () => {
    const { component, mutateSpy } = setup();
    expect(component.canSubmitEmail()).toBe(false); // email vide
    await component.onSubmitEmail();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('onSubmitPhone ne fait rien tant que le téléphone est vide (garde `!canSubmitPhone()`)', async () => {
    const { component, mutateSpy } = setup();
    expect(component.canSubmitPhone()).toBe(false);
    await component.onSubmitPhone();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('onResendOtp ne fait rien tant que le cooldown court (garde `resendCooldown() > 0`)', async () => {
    const { component, mutateSpy } = setup();
    component.resendCooldown.set(45);
    await component.onResendOtp();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('onSubmitOtp ne fait rien tant que le formulaire est invalide (garde `!canSubmitOtp()`)', async () => {
    const { component, mutateSpy } = setup();
    expect(component.canSubmitOtp()).toBe(false); // code/mots de passe vides
    await component.onSubmitOtp();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('maskEmail replie sur l’email brut quand il n’a pas de domaine', () => {
    const { component } = setup();
    component.email.set('pas-de-arobase');
    expect(component.maskedEmail()).toBe('pas-de-arobase');
  });

  it('maskEmail ne garde qu’un seul caractère visible pour une partie locale courte (≤ 2)', () => {
    const { component } = setup();
    component.email.set('ab@sgfe.test');
    expect(component.maskedEmail()).toBe('a···@sgfe.test');
  });

  it('onSubmitPhone : une erreur générique (pas SERVICE_UNAVAILABLE) affiche le message serveur', async () => {
    const { component, mutateSpy } = setup();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'Numéro déjà utilisé' }])),
    );
    component.phone.set('612345678');
    await component.onSubmitPhone();
    expect(component.whatsappError()).toBe('Numéro déjà utilisé');
  });

  it('onResendOtp : une panne WhatsApp (SERVICE_UNAVAILABLE) affiche le message dédié', async () => {
    const { component, mutateSpy } = setup();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'panne', extensions: { code: 'SERVICE_UNAVAILABLE' } }])),
    );
    component.phone.set('612345678');
    component.resendCooldown.set(0);
    await component.onResendOtp();
    expect(component.whatsappError()).toBe("Échec de l'envoi WhatsApp. Réessayez dans quelques instants.");
  });

  it('onResendOtp : une erreur générique sans code affiche le message générique de renvoi', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('panne réseau')));
    component.phone.set('612345678');
    component.resendCooldown.set(0);
    await component.onResendOtp();
    expect(component.whatsappError()).toBe('panne réseau');
  });

  it('onSubmitOtp : un code refusé (UNAUTHENTICATED) affiche le message serveur', async () => {
    const { component, mutateSpy } = setup();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'Code incorrect', extensions: { code: 'UNAUTHENTICATED' } }])),
    );
    component.phone.set('612345678');
    component.otpCode.set('123456');
    component.newPassword.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmitOtp();
    expect(component.whatsappError()).toBe('Code incorrect');
    expect(component.whatsappSubmitted()).toBe(false);
  });

  it('onSubmitOtp : une panne WhatsApp (SERVICE_UNAVAILABLE) affiche le message temporaire dédié', async () => {
    const { component, mutateSpy } = setup();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'boom', extensions: { code: 'SERVICE_UNAVAILABLE' } }])),
    );
    component.phone.set('612345678');
    component.otpCode.set('123456');
    component.newPassword.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmitOtp();
    expect(component.whatsappError()).toBe('Erreur temporaire. Réessayez dans quelques instants.');
  });

  it('onSubmitOtp : une erreur sans code ni message retombe sur le message générique par défaut', async () => {
    const { component, mutateSpy } = setup();
    const { CombinedGraphQLErrors } = await import('@apollo/client/errors');
    mutateSpy.mockReturnValue(throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: '' }])));
    component.phone.set('612345678');
    component.otpCode.set('123456');
    component.newPassword.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmitOtp();
    expect(component.whatsappError()).toBe('Une erreur est survenue. Veuillez réessayer.');
  });
});
