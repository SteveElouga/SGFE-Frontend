import { TestBed } from '@angular/core/testing';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  function setup() {
    const mutateSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: Apollo, useValue: { mutate: mutateSpy } }],
    });

    return { service: TestBed.inject(AuthService), mutateSpy };
  }

  it('stores the access token and user on successful login', async () => {
    const { service, mutateSpy } = setup();
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

    await service.login('admin', 'correct-password');

    expect(service.accessToken()).toBe('token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.role()).toBe('ADMIN');
  });

  it('surfaces the real server error message on a GraphQL auth error', async () => {
    const { service, mutateSpy } = setup();
    const graphQLError = new CombinedGraphQLErrors(
      { data: null },
      [{ message: 'Identifiants incorrects — 3 tentatives restantes avant blocage' }],
    );
    mutateSpy.mockReturnValue(throwError(() => graphQLError));

    await expect(service.login('admin', 'wrong-password')).rejects.toThrow(
      'Identifiants incorrects — 3 tentatives restantes avant blocage',
    );
  });

  it('falls back to a generic message on a network/non-GraphQL error', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('network down')));

    await expect(service.login('admin', 'wrong-password')).rejects.toThrow(
      'Identifiants incorrects. Veuillez réessayer.',
    );
  });

  it('clears the session when refreshToken fails', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValueOnce(
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
    await service.login('admin', 'correct-password');
    expect(service.isAuthenticated()).toBe(true);

    mutateSpy.mockReturnValueOnce(throwError(() => new Error('refresh token expired')));
    await expect(service.refreshToken()).rejects.toThrow();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });
});
