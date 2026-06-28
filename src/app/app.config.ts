import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
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
