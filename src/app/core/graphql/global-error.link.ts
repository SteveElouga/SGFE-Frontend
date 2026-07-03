import { Injector } from '@angular/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { ErrorLink } from '@apollo/client/link/error';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../shared/services/toast.service';

// Errors handled by individual components (inline messages, redirects, etc.)
// — do not surface a global toast for these.
const COMPONENT_HANDLED = new Set([
  'UNAUTHENTICATED',   // → auth-error.link refresh/retry or login redirect
  'NOT_FOUND',         // → component redirects back to list
  'INVALID_ARGUMENT',  // → component shows inline validation
  'ALREADY_EXISTS',    // → component shows inline duplicate message
]);

// Only these two codes warrant a global toast — they're cross-cutting concerns
// that no individual component can meaningfully recover from.
// Everything else: the component owns the error (its error handler already ran
// or will run); we log to console only to avoid double-handling.
const GLOBAL_TOAST_CODES = new Set(['PERMISSION_DENIED', 'SERVICE_UNAVAILABLE']);

export function createGlobalErrorLink(injector: Injector): ErrorLink {
  return new ErrorLink(({ error, operation }) => {
    if (!CombinedGraphQLErrors.is(error)) return;

    // Opt-out: best-effort operations (sidebar, cache-sync subscriptions) explicitly
    // set silentError: true so their catch block handles everything silently.
    if (operation.getContext()['silentError']) return;

    // Subscriptions are background cache-sync features — a failure means degraded
    // real-time updates, not a user-visible error. The component's onError handles it.
    const def = getMainDefinition(operation.query);
    if (def.kind === 'OperationDefinition' && def.operation === 'subscription') return;

    const toast = injector.get(ToastService);
    const translate = injector.get(TranslateService);

    for (const err of error.errors) {
      const code = (err.extensions?.['code'] as string | undefined) ?? 'UNKNOWN';
      if (COMPONENT_HANDLED.has(code)) continue;

      if (GLOBAL_TOAST_CODES.has(code)) {
        // Cross-cutting errors — show a global toast
        if (code === 'PERMISSION_DENIED') {
          toast.error(translate.instant('ERRORS.PERMISSION_DENIED'));
        } else {
          toast.warning(translate.instant('ERRORS.SERVICE_UNAVAILABLE'));
        }
      } else {
        // All other codes (INTERNAL_ERROR, unknown) — the component's error
        // handler will show an inline message. We log for debugging only.
        console.error(
          `[GraphQL] Unhandled error on "${operation.operationName}" — code: ${code}`,
          err,
        );
      }
    }
  });
}
