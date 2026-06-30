import { Injector } from '@angular/core';
import { ErrorLink } from '@apollo/client/link/error';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

// These codes are intentionally left to individual components/services:
// - UNAUTHENTICATED  → auth-error.link (refresh + retry, then AuthService redirects)
// - NOT_FOUND        → component decides where to redirect (e.g. back to list)
// - INVALID_ARGUMENT → component surfaces the validation message inline
// - ALREADY_EXISTS   → component surfaces the duplicate message inline
const COMPONENT_HANDLED = new Set([
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'ALREADY_EXISTS',
]);

export function createGlobalErrorLink(injector: Injector): ErrorLink {
  return new ErrorLink(({ graphQLErrors }) => {
    if (!graphQLErrors?.length) return;

    // Resolve lazily — avoids circular DI at factory time
    const toast = injector.get(MessageService);
    const translate = injector.get(TranslateService);

    for (const err of graphQLErrors) {
      const code = (err.extensions?.['code'] as string | undefined) ?? 'INTERNAL_ERROR';
      if (COMPONENT_HANDLED.has(code)) continue;

      switch (code) {
        case 'PERMISSION_DENIED':
          toast.add({
            key: 'global',
            severity: 'error',
            summary: translate.instant('ERRORS.PERMISSION_DENIED'),
            life: 5000,
          });
          break;

        case 'SERVICE_UNAVAILABLE':
          toast.add({
            key: 'global',
            severity: 'warn',
            summary: translate.instant('ERRORS.SERVICE_UNAVAILABLE'),
            life: 6000,
          });
          break;

        case 'INTERNAL_ERROR':
        default:
          toast.add({
            key: 'global',
            severity: 'error',
            summary: translate.instant('ERRORS.GENERIC'),
            life: 5000,
          });
          break;
      }
    }
  });
}
