import { Injector } from '@angular/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { ErrorLink } from '@apollo/client/link/error';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

const AUTH_RETRIED_CONTEXT_KEY = 'authRetried';

export function createAuthErrorLink(injector: Injector): ErrorLink {
  let refreshing: Promise<void> | null = null;

  return new ErrorLink(({ error, operation, forward }) => {
    if (!CombinedGraphQLErrors.is(error)) {
      return;
    }

    const isUnauthenticated = error.errors.some(
      (graphQLError) => graphQLError.extensions?.['code'] === 'UNAUTHENTICATED',
    );
    // Never retry the refresh-token operation itself: that would create a
    // circular dependency where the refresh waits on itself to resolve.
    if (
      !isUnauthenticated ||
      operation.getContext()[AUTH_RETRIED_CONTEXT_KEY] ||
      operation.operationName === 'RefreshToken'
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
