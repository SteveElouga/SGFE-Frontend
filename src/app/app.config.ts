import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { apolloProviders } from './core/graphql/apollo.config';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { AquaBillPreset } from './core/theme/aquabill-preset';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    ...apolloProviders,
    // Silently restore the session from the refresh_token cookie on app
    // boot — the access token only ever lives in memory, so it's lost on
    // every page reload. Failure here just means "not logged in", not an
    // error worth surfacing.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      return auth.refreshToken().catch(() => undefined);
    }),
    // Required by PrimeNG's internal overlay/transition animations (not yet
    // migrated to Angular's animate.enter/leave). Deprecated API, removal
    // planned for Angular 23 — revisit once PrimeNG drops @angular/animations.
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: AquaBillPreset,
        options: { darkModeSelector: false },
      },
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
