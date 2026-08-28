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

  it('falls back to a generic message on a technical/non-GraphQL error', async () => {
    const { service, mutateSpy } = setup();
    // Message technique (filtré par sanitizeGqlMessage) → le fallback lisible s'applique.
    mutateSpy.mockReturnValue(throwError(() => new Error('Failed to fetch')));

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

/**
 * Robustesse de l'authentification.
 *
 * Neuf méthodes publiques, trois chemins couverts jusqu'ici. Ce qui manquait
 * touche à ce qui coûte le plus cher quand ça rate : les données d'un
 * utilisateur qui survivent à sa déconnexion sur un poste partagé, et les
 * parcours de récupération de compte, qu'on n'emprunte que le jour où l'on est
 * déjà bloqué dehors.
 */
describe('AuthService · robustesse', () => {
  function setup() {
    const mutateSpy = vi.fn();
    // Le stockage local est le point sensible : c'est lui qui fait franchir une
    // session à des montants et des soldes. jsdom n'en fournit pas ici.
    const contenu = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() { return contenu.size; },
        clear: () => contenu.clear(),
        getItem: (k: string) => (contenu.has(k) ? contenu.get(k)! : null),
        key: (i: number) => [...contenu.keys()][i] ?? null,
        removeItem: (k: string) => void contenu.delete(k),
        setItem: (k: string, v: string) => void contenu.set(k, String(v)),
      } as Storage,
    });

    TestBed.configureTestingModule({
      providers: [{ provide: Apollo, useValue: { mutate: mutateSpy } }],
    });
    return { service: TestBed.inject(AuthService), mutateSpy, contenu };
  }

  const CLE_CACHE = 'aquabill.apollo-cache';

  function payloadLogin(id = '1') {
    return {
      data: {
        login: {
          accessToken: 'jeton',
          expiresIn: 3600,
          user: { id, username: 'a', email: 'a@b.c', role: 'ADMIN', isActive: true, createdAt: '2026-01-01' },
        },
      },
    };
  }

  // ── Ce qui ne doit pas survivre à une session ────────────────────────────

  it('la déconnexion efface le cache persisté', async () => {
    // Sur un poste partagé, ce cache contient des montants et des soldes. Le
    // laisser derrière soi les servirait à la personne suivante.
    const { service, mutateSpy, contenu } = setup();
    contenu.set(CLE_CACHE, JSON.stringify({ userId: '1', data: {} }));

    mutateSpy.mockReturnValue(of({ data: { logout: true } }));
    await service.logout();

    expect(window.localStorage.getItem(CLE_CACHE)).toBeNull();
  });

  it('elle l’efface même si le serveur refuse la déconnexion', async () => {
    // Un serveur injoignable ne doit pas laisser une session ouverte côté poste :
    // c'est précisément le cas où l'on veut être sûr que rien ne reste.
    const { service, mutateSpy, contenu } = setup();
    contenu.set(CLE_CACHE, JSON.stringify({ userId: '1', data: {} }));

    mutateSpy.mockReturnValue(throwError(() => new Error('réseau')));
    await service.logout().catch(() => undefined);

    expect(window.localStorage.getItem(CLE_CACHE)).toBeNull();
    expect(service.accessToken()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('la connexion repart d’un cache vide', async () => {
    // Le cache d'un utilisateur précédent ne doit jamais peindre l'écran du
    // suivant, même une fraction de seconde.
    const { service, mutateSpy, contenu } = setup();
    contenu.set(CLE_CACHE, JSON.stringify({ userId: 'autre', data: {} }));

    mutateSpy.mockReturnValue(of(payloadLogin('1')));
    await service.login('a', 'b');

    expect(window.localStorage.getItem(CLE_CACHE)).toBeNull();
  });

  it('une connexion refusée ne laisse pas de session à moitié ouverte', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(throwError(() => new Error('refus')));

    await expect(service.login('a', 'mauvais')).rejects.toThrow();
    expect(service.accessToken()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('une réponse vide est traitée comme un échec, pas comme un succès', async () => {
    // Un serveur qui répond 200 sans charge utile ne connecte personne.
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(service.login('a', 'b')).rejects.toThrow();
    expect(service.isAuthenticated()).toBe(false);
  });

  // ── Les parcours de récupération ─────────────────────────────────────────

  it('la demande de code par téléphone remonte l’erreur réelle', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ errors: [{ message: 'Numéro inconnu' }] } as never)),
    );
    await expect(service.requestPhoneOtp('+237600000000')).rejects.toThrow(/Numéro inconnu/);
  });

  it('un code refusé n’ouvre aucune session', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ errors: [{ message: 'Code expiré' }] } as never)),
    );
    await expect(service.verifyOtpAndSetPassword('+237600000000', '000000', 'x')).rejects.toThrow();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('l’activation de compte remonte un jeton invalide', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(
      throwError(() => new CombinedGraphQLErrors({ errors: [{ message: 'Lien expiré' }] } as never)),
    );
    await expect(service.activateAccount('jeton', 'motdepasse')).rejects.toThrow(/Lien expiré/);
  });

  it('la réinitialisation par jeton ferme la session en cours', async () => {
    // Changer son mot de passe doit invalider ce qui traînait : sinon un poste
    // resté ouvert garde un accès que l'on croyait avoir coupé.
    const { service, mutateSpy, contenu } = setup();
    mutateSpy.mockReturnValue(of(payloadLogin('1')));
    await service.login('a', 'b');
    contenu.set(CLE_CACHE, JSON.stringify({ userId: '1', data: {} }));

    mutateSpy.mockReturnValue(of({ data: { resetPassword: true } }));
    await service.resetPassword('jeton', 'nouveau');

    expect(window.localStorage.getItem(CLE_CACHE)).toBeNull();
  });

  // ── Le rôle, qui décide de ce qu'on voit ────────────────────────────────

  it('les rôles se dérivent de l’utilisateur, jamais devinés', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of(payloadLogin('1')));
    await service.login('a', 'b');

    expect(service.role()).toBe('ADMIN');
    expect(service.isAdmin()).toBe(true);
    expect(service.isAgent()).toBe(false);
    expect(service.isComptable()).toBe(false);
  });

  it('sans session, aucun rôle n’est accordé', () => {
    const { service } = setup();
    expect(service.role()).toBeNull();
    expect(service.isAdmin()).toBe(false);
    expect(service.isAgent()).toBe(false);
    expect(service.isComptable()).toBe(false);
  });
});
