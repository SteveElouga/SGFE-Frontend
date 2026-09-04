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
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
    expect(c.canSubmit()).toBe(false);
  });

  it('refuse un code qui n’a pas exactement 6 chiffres', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('12345');
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
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
    c.password.set('motdepasse1');
    c.confirmPassword.set('autrepasse2');
    expect(c.canSubmit()).toBe(false);
  });

  it('accepte une combinaison entièrement valide', () => {
    const { c } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
    expect(c.canSubmit()).toBe(true);
  });
});

describe('ActivateOtpComponent — soumission', () => {
  it('normalise le numéro (+237) avant l’envoi', async () => {
    const { c, verifyOtpAndSetPassword } = monter();
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
    await c.onSubmit();
    expect(verifyOtpAndSetPassword).toHaveBeenCalledWith('+237612345678', '123456', 'motdepasse1');
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
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
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
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
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
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
    await c.onSubmit();
    expect(c.errorMessage()).toBe('Erreur temporaire. Réessayez dans quelques instants.');
  });

  it('une erreur inattendue retombe sur le message générique', async () => {
    const { c } = monter({
      verifyOtpAndSetPassword: vi.fn().mockRejectedValue(new Error('panne réseau')),
    });
    c.phone.set('612345678');
    c.otpCode.set('123456');
    c.password.set('motdepasse1');
    c.confirmPassword.set('motdepasse1');
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
