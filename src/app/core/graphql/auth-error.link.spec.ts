import { Injector } from '@angular/core';
import { ApolloLink } from '@apollo/client/link';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import type { ApolloClient } from '@apollo/client/core';
import { gql } from '@apollo/client/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { createAuthErrorLink } from './auth-error.link';

// `ApolloLink.execute` exige un `client` dans son contexte, mais seul le
// canal `next:` d'ErrorLink (résultat avec `errors`, non exercé ici) le lit
// réellement — un faux client non typé suffit pour le canal `error:` utilisé
// par ces tests.
const CTX = { client: {} as unknown as ApolloClient };

/**
 * Flux 401 → rafraîchissement silencieux → retry, côté GraphQL (chemin
 * emprunté par la quasi-totalité de l'application — la règle fondamentale du
 * projet est que tout passe par `/graphql`).
 *
 * `ErrorLink` ne s'invoque pas directement : on la compose avec un faux lien
 * « en aval » (`ApolloLink.concat`) qui simule le serveur, et on exécute la
 * chaîne avec `ApolloLink.execute`. Le canal `error:` d'ErrorLink (déclenché
 * quand le lien aval échoue avec une `CombinedGraphQLErrors`) suffit à
 * exercer `createAuthErrorLink` sans avoir à construire un `ApolloClient`
 * complet : le canal `next:` (résultat avec un champ `errors`) a besoin de
 * `operation.client.queryManager`, un détail d'implémentation interne d'Apollo
 * hors du périmètre de ce test.
 */

const QUERY_A = gql`query GetCampagnes { campagnes { id } }`;
const QUERY_B = gql`query GetAbonnes { abonnes { id } }`;
const REFRESH_MUTATION = gql`mutation RefreshToken { refreshToken { accessToken } }`;

function erreurNonAuthentifiee(message = 'Session expirée'): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors(
    { data: null },
    [{ message, extensions: { code: 'UNAUTHENTICATED' } }],
  );
}

function injecteurAvec(auth: Partial<AuthService>): Injector {
  return Injector.create({ providers: [{ provide: AuthService, useValue: auth }] });
}

describe('createAuthErrorLink', () => {
  it('rafraîchit silencieusement sur UNAUTHENTICATED puis rejoue la requête ORIGINALE', async () => {
    const refreshToken = vi.fn().mockResolvedValue(undefined);
    const link = createAuthErrorLink(injecteurAvec({ refreshToken }));

    let appel = 0;
    const lienAval = new ApolloLink(() => {
      appel++;
      return appel === 1
        ? throwError(() => erreurNonAuthentifiee())
        : of({ data: { campagnes: [{ id: '1' }] } });
    });

    const resultat = await firstValueFrom(
      ApolloLink.execute(link.concat(lienAval), { query: QUERY_A }, CTX),
    );

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(appel).toBe(2); // la requête initiale, puis EXACTEMENT une rejoue
    expect(resultat).toEqual({ data: { campagnes: [{ id: '1' }] } });
  });

  it('un rafraîchissement qui échoue lui-même propage l’erreur sans boucler', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('Refresh token invalide/expiré'));
    const link = createAuthErrorLink(injecteurAvec({ refreshToken }));

    let appel = 0;
    const lienAval = new ApolloLink(() => {
      appel++;
      return throwError(() => erreurNonAuthentifiee());
    });

    await expect(
      firstValueFrom(ApolloLink.execute(link.concat(lienAval), { query: QUERY_A }, CTX)),
    ).rejects.toThrow('Refresh token invalide/expiré');

    // Un seul essai de rafraîchissement, et la requête n'est JAMAIS rejouée :
    // c'est ce qui empêche la boucle infinie. `refreshToken()` a par ailleurs
    // déjà nettoyé la session (`clearSession`), couvert dans auth.service.spec.ts —
    // le prochain garde de route (authGuard/roleGuard) renverra donc vers /login.
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(appel).toBe(1);
  });

  it('des requêtes concurrentes en 401 ne déclenchent qu’UN SEUL rafraîchissement', async () => {
    let debloquerRefresh!: () => void;
    const refreshToken = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => { debloquerRefresh = resolve; }),
    );
    const link = createAuthErrorLink(injecteurAvec({ refreshToken }));

    let appel = 0;
    const lienAval = new ApolloLink(() => {
      appel++;
      // Les deux premiers appels (une par opération) échouent en 401 ; les
      // rejeux (après refresh) réussissent.
      return appel <= 2
        ? throwError(() => erreurNonAuthentifiee())
        : of({ data: { ok: true } });
    });
    const composé = link.concat(lienAval);

    const p1 = firstValueFrom(ApolloLink.execute(composé, { query: QUERY_A }, CTX));
    const p2 = firstValueFrom(ApolloLink.execute(composé, { query: QUERY_B }, CTX));

    // Les deux opérations ont démarré leur 401 de façon synchrone (throwError
    // émet immédiatement à la souscription) : le rafraîchissement mutualisé
    // doit déjà être en vol pour les deux, sans attendre quoi que ce soit.
    expect(refreshToken).toHaveBeenCalledTimes(1);

    debloquerRefresh();
    await Promise.all([p1, p2]);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(appel).toBe(4); // 2 échecs initiaux + 2 rejeux, pour 1 seul refresh
  });

  it('n’essaie jamais de rafraîchir sur l’opération RefreshToken elle-même (coupe le cycle à la source)', async () => {
    const refreshToken = vi.fn().mockResolvedValue(undefined);
    const link = createAuthErrorLink(injecteurAvec({ refreshToken }));

    let appel = 0;
    const lienAval = new ApolloLink(() => {
      appel++;
      return throwError(() => erreurNonAuthentifiee('Refresh token manquant ou invalide'));
    });

    await expect(
      firstValueFrom(ApolloLink.execute(link.concat(lienAval), { query: REFRESH_MUTATION }, CTX)),
    ).rejects.toThrow('Refresh token manquant ou invalide');

    expect(refreshToken).not.toHaveBeenCalled();
    expect(appel).toBe(1);
  });

  it('ignore les erreurs qui ne sont pas UNAUTHENTICATED (aucun rafraîchissement déclenché)', async () => {
    const refreshToken = vi.fn().mockResolvedValue(undefined);
    const link = createAuthErrorLink(injecteurAvec({ refreshToken }));

    const permissionDenied = new CombinedGraphQLErrors(
      { data: null },
      [{ message: 'Accès refusé', extensions: { code: 'PERMISSION_DENIED' } }],
    );
    const lienAval = new ApolloLink(() => throwError(() => permissionDenied));

    await expect(
      firstValueFrom(ApolloLink.execute(link.concat(lienAval), { query: QUERY_A }, CTX)),
    ).rejects.toThrow('Accès refusé');

    expect(refreshToken).not.toHaveBeenCalled();
  });
});
