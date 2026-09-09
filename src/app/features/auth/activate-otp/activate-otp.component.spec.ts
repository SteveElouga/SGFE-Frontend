import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { ActivateOtpComponent } from './activate-otp.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Activation de compte par OTP WhatsApp — dernière étape avant qu'un agent
 * fraîchement créé puisse se connecter. Ces tests portent sur les gardes de
 * `canSubmit` (rien ne part avec un code, un mot de passe ou un téléphone mal
 * formés), sur le pré-remplissage depuis le lien reçu par l'agent, et sur les
 * trois messages d'erreur distincts qu'un même écran doit savoir afficher.
 */
function creerRoute(phone: string | null) {
  return {
    snapshot: { queryParamMap: { get: (k: string) => (k === 'phone' ? phone : null) } },
  } as unknown as ActivatedRoute;
}

function monter(over: {
  phone?: string | null;
  requestPhoneOtp?: ReturnType<typeof vi.fn>;
  verifyOtpAndSetPassword?: ReturnType<typeof vi.fn>;
} = {}) {
  const requestPhoneOtp = over.requestPhoneOtp ?? vi.fn().mockResolvedValue('+237 6XX XXX 000');
  const verifyOtpAndSetPassword = over.verifyOtpAndSetPassword ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [ActivateOtpComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: creerRoute(over.phone ?? null) },
      { provide: AuthService, useValue: { requestPhoneOtp, verifyOtpAndSetPassword } },
    ],
  });
  const fixture = TestBed.createComponent(ActivateOtpComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, requestPhoneOtp, verifyOtpAndSetPassword };
}

function erreur(message: string, code?: string) {
  return new CombinedGraphQLErrors({ data: null }, [{ message, extensions: code ? { code } : undefined }]);
}

describe('ActivateOtpComponent — pré-remplissage', () => {
  it('sans paramètre `phone` : le champ téléphone reste à saisir', () => {
    const { c } = monter({ phone: null });
    expect(c.hasPhoneParam).toBe(false);
    expect(c.phone()).toBe('');
  });

  it('avec un `phone` en query param : préremplit et masque le champ', () => {
    const { c } = monter({ phone: '+237612345678' });
    expect(c.hasPhoneParam).toBe(true);
    expect(c.phone()).toBe('612345678');
  });
});

describe('ActivateOtpComponent — validité du formulaire', () => {
  it('refuse un numéro invalide même avec le reste correct', () => {
    const { c } = monter();
    c.phone.set('123');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    expect(c.canSubmit()).toBe(false);
  });

  it('refuse un code qui n’a pas exactement 6 chiffres', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('12345');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    expect(c.canSubmit()).toBe(false);
  });

  it('refuse un mot de passe trop court', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('short1');
    c.confirmPassword.set('short1');
    expect(c.canSubmit()).toBe(false);
  });

  it('refuse deux mots de passe différents', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('autrepasse2');
    expect(c.canSubmit()).toBe(false);
  });

  it('accepte une combinaison entièrement valide', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    expect(c.canSubmit()).toBe(true);
  });
});

describe('ActivateOtpComponent — soumission', () => {
  it('normalise le numéro (+237) avant l’envoi', async () => {
    const { c, verifyOtpAndSetPassword } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    await c.onSubmit();
    expect(verifyOtpAndSetPassword).toHaveBeenCalledWith('+237612345678', '123456', 'longenough1');
  });

  it('ne soumet rien tant que le formulaire est invalide', async () => {
    const { c, verifyOtpAndSetPassword } = monter();
    await c.onSubmit();
    expect(verifyOtpAndSetPassword).not.toHaveBeenCalled();
  });

  it('passe en état « soumis » après succès', async () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    await c.onSubmit();
    expect(c.submitted()).toBe(true);
    expect(c.loading()).toBe(false);
  });

  it('un code refusé (UNAUTHENTICATED) affiche le message serveur', async () => {
    const { c } = monter({
      verifyOtpAndSetPassword: vi.fn().mockRejectedValue(erreur('Code incorrect', 'UNAUTHENTICATED')),
    });
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    await c.onSubmit();
    expect(c.errorMessage()).toBe('Code incorrect');
    expect(c.submitted()).toBe(false);
  });

  it('une panne du service WhatsApp affiche un message temporaire dédié', async () => {
    const { c } = monter({
      verifyOtpAndSetPassword: vi.fn().mockRejectedValue(erreur('boom interne', 'SERVICE_UNAVAILABLE')),
    });
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    await c.onSubmit();
    expect(c.errorMessage()).toBe('Erreur temporaire. Réessayez dans quelques instants.');
  });

  it('une erreur inattendue retombe sur le message générique', async () => {
    const { c } = monter({
      verifyOtpAndSetPassword: vi.fn().mockRejectedValue(new Error('panne réseau')),
    });
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    await c.onSubmit();
    expect(c.errorMessage()).toBe('panne réseau');
  });
});

describe('ActivateOtpComponent — renvoi du code', () => {
  it('relance le cooldown après un renvoi réussi', async () => {
    const { c, requestPhoneOtp } = monter({ phone: '+237612345678' });
    c.resendCooldown.set(0);
    await c.onResend();
    expect(requestPhoneOtp).toHaveBeenCalledWith('+237612345678');
    expect(c.resendCooldown()).toBeGreaterThan(0);
  });

  it('n’envoie rien tant que le cooldown court', async () => {
    const { c, requestPhoneOtp } = monter();
    c.resendCooldown.set(30);
    await c.onResend();
    expect(requestPhoneOtp).not.toHaveBeenCalled();
  });

  it('affiche un message dédié quand WhatsApp est indisponible', async () => {
    const { c } = monter({
      requestPhoneOtp: vi.fn().mockRejectedValue(erreur('panne', 'SERVICE_UNAVAILABLE')),
    });
    c.resendCooldown.set(0);
    await c.onResend();
    expect(c.errorMessage()).toBe("Échec de l'envoi WhatsApp. Réessayez dans quelques instants.");
  });
});

/**
 * Les tests ci-dessus rendent déjà le composant une fois (`fixture.detectChanges()`
 * dans `monter()`), mais n'exercent jamais les deux branches les plus visibles
 * du template : le champ téléphone conditionnel (`@if (!hasPhoneParam)`) et
 * l'écran de succès (`@if (!submitted()) … @else …`), ni le compte à rebours
 * initial de `app-auth-otp-resend`.
 */
describe('ActivateOtpComponent — rendu du template', () => {
  it('saisir dans les VRAIS champs imbriqués (téléphone, code, mots de passe) met à jour les signaux parents', () => {
    const { fixture, c } = monter({ phone: null });
    const racine = fixture.nativeElement as HTMLElement;

    const champTel = racine.querySelector<HTMLInputElement>('#activate-phone')!;
    const champOtp = racine.querySelector<HTMLInputElement>('#activate-otp')!;
    const champMdp = racine.querySelector<HTMLInputElement>('#activate-password')!;
    const champConfirm = racine.querySelector<HTMLInputElement>('#activate-confirm')!;
    expect(champTel).toBeTruthy();
    expect(champOtp).toBeTruthy();
    expect(champMdp).toBeTruthy();
    expect(champConfirm).toBeTruthy();

    champTel.value = '612345678';
    champTel.dispatchEvent(new Event('input', { bubbles: true }));
    champOtp.value = '123456';
    champOtp.dispatchEvent(new Event('input', { bubbles: true }));
    champMdp.value = 'longenough1';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    champConfirm.value = 'longenough1';
    champConfirm.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.phone()).toBe('612345678');
    expect(c.otpCode()).toBe('123456');
    expect(c.password()).toBe('longenough1');
    expect(c.confirmPassword()).toBe('longenough1');
  });

  it('sans `phone` en query param : affiche le champ téléphone à saisir', () => {
    const { fixture } = monter({ phone: null });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('app-auth-phone-input')).toBeTruthy();
    expect(racine.textContent).toContain('ACTIVATION.SOUS_TITRE');
  });

  it('avec un `phone` en query param : masque le champ téléphone et affiche le numéro masqué', () => {
    const { fixture, c } = monter({ phone: '+237612345678' });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('app-auth-phone-input')).toBeNull();
    expect(racine.textContent).toContain('ACTIVATION.SOUS_TITRE_TEL');
    expect(racine.textContent).toContain(c.maskedPhone());
  });

  it('affiche le compte à rebours au montage (cooldown déjà démarré), pas le bouton "Renvoyer"', () => {
    const { fixture } = monter();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.auth-otp-resend__countdown')).toBeTruthy();
    expect(racine.querySelector('.auth-otp-resend__btn')).toBeNull();
  });

  it('une fois le cooldown écoulé, un clic réel sur "Renvoyer" appelle bien onResend', async () => {
    const { fixture, c, requestPhoneOtp } = monter({ phone: '+237612345678' });
    const racine = fixture.nativeElement as HTMLElement;
    c.resendCooldown.set(0);
    fixture.detectChanges();

    const bouton = racine.querySelector<HTMLButtonElement>('.auth-otp-resend__btn')!;
    expect(bouton).toBeTruthy();
    bouton.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(requestPhoneOtp).toHaveBeenCalledWith('+237612345678');
  });

  it('après soumission réussie (submit réel du formulaire), affiche l’écran de succès et masque le formulaire', async () => {
    const { fixture, c } = monter({ phone: '+237612345678' });
    const racine = fixture.nativeElement as HTMLElement;
    c.otpCode.set('123456');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    const form = racine.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(c.submitted()).toBe(true);
    expect(racine.querySelector('form')).toBeNull();
    expect(racine.querySelector('.auth-screen__success')).toBeTruthy();
    expect(racine.querySelector('a[routerLink="/login"]')).toBeTruthy();
  });
});

describe('ActivateOtpComponent — nettoyage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('arrête le minuteur de cooldown à la destruction', () => {
    const { fixture, c } = monter();
    expect(c.resendCooldown()).toBeGreaterThan(0);
    fixture.destroy();
    const avant = c.resendCooldown();
    vi.advanceTimersByTime(5000);
    expect(c.resendCooldown()).toBe(avant); // n'a plus bougé : le timer est coupé
  });
});
