import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { SetPasswordComponent } from './set-password.component';

describe('SetPasswordComponent', () => {
  function setup(mode: 'activate' | 'reset', token: string | null) {
    const mutateSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [SetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { mutate: mutateSpy } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { mode },
              queryParamMap: convertToParamMap(token ? { token } : {}),
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SetPasswordComponent);
    return { fixture, component: fixture.componentInstance, mutateSpy };
  }

  it('shows an error immediately when the token is missing', () => {
    const { component } = setup('reset', null);
    expect(component.errorMessage()).toBe('Lien invalide : le jeton est manquant.');
    expect(component.canSubmit()).toBe(false);
  });

  it('requires matching passwords of at least 8 characters before enabling submit', () => {
    const { component } = setup('reset', 'tok-123');

    component.password.set('short');
    component.confirmPassword.set('short');
    expect(component.canSubmit()).toBe(false);

    component.password.set('longenough1');
    component.confirmPassword.set('longenough2');
    expect(component.passwordsMatch()).toBe(false);
    expect(component.canSubmit()).toBe(false);

    component.confirmPassword.set('longenough1');
    expect(component.canSubmit()).toBe(true);
  });

  it('calls resetPassword in reset mode and shows success', async () => {
    const { component, mutateSpy } = setup('reset', 'tok-123');
    mutateSpy.mockReturnValue(of({ data: { resetPassword: true } }));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmit();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token: 'tok-123', password: 'longenough1' } }),
    );
    expect(component.success()).toBe(true);
  });

  it('calls activateAccount in activate mode', async () => {
    const { component, mutateSpy } = setup('activate', 'tok-456');
    mutateSpy.mockReturnValue(of({ data: { activateAccount: true } }));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    component.fullName.set('Jean Test'); // requis pour valider le mode activation
    await component.onSubmit();

    const mutationCall = mutateSpy.mock.calls[0][0];
    expect(mutationCall.variables).toEqual({ token: 'tok-456', password: 'longenough1' });
    expect(component.success()).toBe(true);
  });

  it('shows a generic error when the token is invalid or expired', async () => {
    const { component, mutateSpy } = setup('reset', 'expired-token');
    mutateSpy.mockReturnValue(throwError(() => new Error('token expired')));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmit();

    expect(component.success()).toBe(false);
    expect(component.errorMessage()).toBe(
      'Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis la page de connexion.',
    );
  });
});
