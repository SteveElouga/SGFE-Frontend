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
    if (!isUnauthenticated || operation.getContext()[AUTH_RETRIED_CONTEXT_KEY]) {
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
