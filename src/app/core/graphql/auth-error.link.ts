import { Injector } from '@angular/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { ErrorLink } from '@apollo/client/link/error';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

const AUTH_RETRIED_CONTEXT_KEY = 'authRetried';

// Opérations d'authentification / pré-auth : un UNAUTHENTICATED y est une
// réponse FINALE légitime (mauvais identifiants, token de reset expiré, pas de
// cookie…), pas un access token périmé à rafraîchir. Les exclure du retry évite
// que « Refresh token manquant/invalide » masque la vraie erreur (ex. login),
// et coupe la boucle circulaire sur RefreshToken lui-même.
const NON_RETRYABLE_OPERATIONS = new Set([
  'Login',
  'RefreshToken',
  'Logout',
  'RequestPasswordReset',
  'ActivateAccount',
  'ResetPassword',
  'RequestPhoneOtp',
  'VerifyOtpAndSetPassword',
]);

export function createAuthErrorLink(injector: Injector): ErrorLink {
  let refreshing: Promise<void> | null = null;

  return new ErrorLink(({ error, operation, forward }) => {
    if (!CombinedGraphQLErrors.is(error)) {
      return;
    }

    const isUnauthenticated = error.errors.some(
      (graphQLError) => graphQLError.extensions?.['code'] === 'UNAUTHENTICATED',
    );
    // Ne retente via refresh QUE les opérations authentifiées dont l'access
    // token a expiré — jamais les opérations d'auth elles-mêmes (cf. liste).
    if (
      !isUnauthenticated ||
      operation.getContext()[AUTH_RETRIED_CONTEXT_KEY] ||
      NON_RETRYABLE_OPERATIONS.has(operation.operationName ?? '')
    ) {
      return;
    }

    operation.setContext({ [AUTH_RETRIED_CONTEXT_KEY]: true });

    refreshing ??= injector
      .get(AuthService)
      .refreshToken()
      .finally(() => {
        refreshing = null;
      });

    return from(refreshing).pipe(switchMap(() => forward(operation)));
  });
}
