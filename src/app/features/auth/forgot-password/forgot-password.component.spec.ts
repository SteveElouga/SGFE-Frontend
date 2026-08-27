import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
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
