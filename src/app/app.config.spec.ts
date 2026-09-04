import { LOCALE_ID } from '@angular/core';
import { appConfig } from './app.config';

/**
 * `app.config.ts` est presque exclusivement de la configuration de providers
 * (bootstrap DI) : `provideRouter`, `provideHttpClient`, `provideApollo`,
 * `providePrimeNG`, `provideServiceWorker`, `provideTranslateService`…
 * Ces appels rendent des `EnvironmentProviders` opaques (l'API interne
 * `ɵproviders` n'est pas un contrat public à vérifier depuis un test), et les
 * deux `provideAppInitializer(...)` n'exécutent leur fermeture qu'au vrai
 * bootstrap de l'application (`ApplicationInitStatus.runInitializers()`), pas
 * à la simple construction du tableau de providers — les monter ici pour de
 * vrai déclencherait un appel réseau réel (`AuthService.refreshToken()`) et
 * l'enregistrement d'un Service Worker, ce que ce lot de tests s'interdit.
 *
 * La logique que ces fermetures appellent est déjà couverte ailleurs :
 * `AuthService.refreshToken()` par `auth.service.spec.ts`, et
 * `setupCachePersistence` par `apollo-persistence.spec.ts`.
 *
 * Ce qui reste directement et utilement vérifiable ici, sans monter
 * l'application, c'est le littéral `LOCALE_ID` — une régression dessus casse
 * silencieusement le formatage des montants FCFA et des dates dans toute
 * l'application (voir le commentaire du fichier source).
 */
describe('appConfig', () => {
  it('déclare un tableau de providers non vide', () => {
    expect(Array.isArray(appConfig.providers)).toBe(true);
    expect(appConfig.providers.length).toBeGreaterThan(0);
  });

  it('fixe LOCALE_ID à "fr" (montants FCFA et dates formatés en français)', () => {
    const provider = appConfig.providers.find(
      (p): p is { provide: unknown; useValue: unknown } =>
        typeof p === 'object' && p !== null && 'provide' in p && (p as { provide: unknown }).provide === LOCALE_ID,
    );
    expect(provider).toBeDefined();
    expect(provider!.useValue).toBe('fr');
  });
});
