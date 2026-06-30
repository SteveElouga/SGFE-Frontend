import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  function setup() {
    const mutateSpy = vi.fn();

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([
          { path: 'login', component: LoginComponent },
          { path: '**', redirectTo: 'login' },
        ]),
        { provide: Apollo, useValue: { mutate: mutateSpy } },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    return { fixture, component: fixture.componentInstance, mutateSpy };
  }

  it('should create the component', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('disables submit until both fields are filled', () => {
    const { component } = setup();
    expect(component.canSubmit()).toBe(false);

    component.username.set('admin');
    expect(component.canSubmit()).toBe(false);

    component.password.set('secret');
    expect(component.canSubmit()).toBe(true);
  });

  it('shows a generic error message when login fails', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('Identifiants incorrects')));

    component.username.set('admin');
    component.password.set('wrong-password');
    await component.onSubmit();

    expect(component.errorMessage()).toBe('Identifiants incorrects. Veuillez réessayer.');
    expect(component.loading()).toBe(false);
  });

  it('clears the error message and stops loading after a successful login', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(
      of({
        data: {
          login: {
            accessToken: 'token',
            expiresIn: 3600,
            user: {
              id: '1',
              username: 'admin',
              email: 'admin@aquabill.test',
              role: 'ADMIN',
              isActive: true,
              createdAt: '2026-06-28T00:00:00Z',
            },
          },
        },
      }),
    );

    component.username.set('admin');
    component.password.set('correct-password');
    await component.onSubmit();

    expect(component.errorMessage()).toBeNull();
    expect(component.loading()).toBe(false);
  });
});
