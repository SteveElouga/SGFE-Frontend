import { ErrorHandler, Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Remonte les exceptions Angular (levées dans un template, un lifecycle hook,
 * un `computed()`…) à Faro (-> Loki) et, si un DSN est configuré, à GlitchTip.
 *
 * Imports dynamiques, comme `main.ts::initTelemetry` — mêmes bibliothèques,
 * même raison (voir son commentaire) : `@grafana/faro-web-sdk` est déjà
 * chargé en parallèle du bootstrap, donc ce second `import()` retombe sur le
 * même chunk déjà en cache, jamais un second téléchargement. `@sentry/angular`
 * suit le même principe (voir `main.ts::initGlitchtip`, qui l'initialise déjà
 * si un DSN est configuré) — un import statique ici réintroduirait les deux
 * bibliothèques dans le bundle initial malgré l'effort déjà fait pour les en
 * sortir.
 */
@Injectable()
export class ObservabilityErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));

    void import('@grafana/faro-web-sdk').then(({ faro }) => faro?.api?.pushError(err));

    if (environment.glitchtipDsn) {
      void import('@sentry/angular').then((Sentry) => Sentry.captureException(err));
    }

    console.error(error);
  }
}
