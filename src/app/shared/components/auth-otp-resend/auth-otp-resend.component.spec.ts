import { TestBed } from '@angular/core/testing';
import { AuthOtpResendComponent } from './auth-otp-resend.component';

/**
 * Renvoi du code OTP : soit un compte à rebours, soit un bouton actif — jamais
 * les deux à la fois, et le bouton reste désactivé pendant un renvoi en cours.
 */
describe('AuthOtpResendComponent', () => {
  function setup(inputs: Partial<{
    cooldownDisplay: string | null;
    loading: boolean;
    countdownPrefix: string;
    resendLabel: string;
  }> = {}) {
    TestBed.configureTestingModule({ imports: [AuthOtpResendComponent] });
    const fixture = TestBed.createComponent(AuthOtpResendComponent);
    if (inputs.cooldownDisplay !== undefined) fixture.componentRef.setInput('cooldownDisplay', inputs.cooldownDisplay);
    if (inputs.loading !== undefined) fixture.componentRef.setInput('loading', inputs.loading);
    if (inputs.countdownPrefix !== undefined) fixture.componentRef.setInput('countdownPrefix', inputs.countdownPrefix);
    if (inputs.resendLabel !== undefined) fixture.componentRef.setInput('resendLabel', inputs.resendLabel);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le compte à rebours quand il est actif, pas le bouton', () => {
    const { racine } = setup({ cooldownDisplay: '00:45' });
    expect(racine.querySelector('.auth-otp-resend__countdown')?.textContent).toContain('00:45');
    expect(racine.querySelector('button')).toBeNull();
  });

  it('affiche le bouton de renvoi une fois le compte à rebours écoulé', () => {
    const { racine } = setup({ cooldownDisplay: null });
    expect(racine.querySelector('.auth-otp-resend__countdown')).toBeNull();
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton).toBeTruthy();
    expect(bouton.disabled).toBe(false);
  });

  it('désactive le bouton pendant un renvoi en cours', () => {
    const { racine } = setup({ cooldownDisplay: null, loading: true });
    const bouton = racine.querySelector('button') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it('émet resend au clic du bouton', () => {
    const { fixture, racine } = setup({ cooldownDisplay: null });
    const recu: void[] = [];
    fixture.componentInstance.resend.subscribe(() => recu.push(undefined));
    (racine.querySelector('button') as HTMLButtonElement).click();
    expect(recu.length).toBe(1);
  });

  it('utilise le préfixe et le libellé personnalisés', () => {
    const { racine } = setup({ cooldownDisplay: '01:00', countdownPrefix: 'Nouveau code dans' });
    expect(racine.textContent).toContain('Nouveau code dans');
  });
});
