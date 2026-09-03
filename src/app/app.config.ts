import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideTranslateService } from '@ngx-translate/core';

// Sans locale enregistrée, les pipes `number`, `date` et `percent` formatent en
// anglais : « 1,234.5 » là où l'application affiche des montants en FCFA et des
// index de compteur. Le français est la langue de référence (PRODUCT.md § 4).
registerLocaleData(localeFr, 'fr');
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { apolloProviders, apolloCache } from './core/graphql/apollo.config';
import { setupCachePersistence } from './core/graphql/apollo-persistence';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { AquaBillPreset } from './core/theme/aquabill-preset';
import { provideServiceWorker } from '@angular/service-worker';
import { MessageService } from 'primeng/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    ...apolloProviders,
    MessageService,
    // Persistance offline du cache : sauvegarde à la fermeture de l'app,
    // estampillée du userId. La restauration (réouverture même utilisateur) et
    // les purges (login / échec de refresh / logout) sont pilotées par
    // AuthService, pour rester strictement rattachées à l'identité de session
    // et ne jamais servir les données d'un utilisateur à un autre.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      setupCachePersistence(apolloCache, auth);
    }),
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
        // `.p-dark` plutôt que le défaut `system` (media query directe) : le
        // thème suit le système PAR DÉFAUT, mais `ThemeService` doit pouvoir
        // imposer un mode manuel indépendamment de lui — un sélecteur de
        // classe est le seul des deux qu'un script peut piloter.
        options: { darkModeSelector: '.p-dark' },
      },
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: LOCALE_ID, useValue: 'fr' },
    ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
    ...provideTranslateHttpLoader({ prefix: '/i18n/' }),
  ],
};
