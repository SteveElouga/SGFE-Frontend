import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  function setup() {
    const mutateSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [provideRouter([]), { provide: Apollo, useValue: { mutate: mutateSpy } }],
    });

    const fixture = TestBed.createComponent(ForgotPasswordComponent);
    return { fixture, component: fixture.componentInstance, mutateSpy };
  }

  it('should create the component', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('disables submit until an email is entered', () => {
    const { component } = setup();
    expect(component.canSubmit()).toBe(false);

    component.email.set('admin@aquabill.test');
    expect(component.canSubmit()).toBe(true);
  });

  it('shows the success state once the request completes, even for an unknown email', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: { requestPasswordReset: true } }));

    component.email.set('unknown@aquabill.test');
    await component.onSubmit();

    expect(component.submitted()).toBe(true);
    expect(component.errorMessage()).toBeNull();
  });

  it('shows a generic error message on a network/server failure', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('network error')));

    component.email.set('admin@aquabill.test');
    await component.onSubmit();

    expect(component.submitted()).toBe(false);
    expect(component.errorMessage()).toBe('Une erreur est survenue. Veuillez réessayer.');
  });
});
