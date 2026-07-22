import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Exécute une requête HttpClient et, sur **401** (access token périmé), tente UN
 * rafraîchissement silencieux du token puis rejoue la requête **une seule fois**.
 *
 * Pendant REST du `auth-error.link` (qui couvre GraphQL) pour les flux binaires
 * servis hors GraphQL — PDF de facture, exports CSV/PDF. Avec un access token
 * court (15 min), un de ces téléchargements déclenché après une période sans
 * requête GraphQL pourrait sinon échouer sur un 401 ; ce helper l'absorbe.
 *
 * `request` est une **fabrique** (pas un Observable déjà créé) pour que la nouvelle
 * tentative reparte d'une requête neuve : le `jwtInterceptor` y injectera alors le
 * nouveau Bearer. Si le refresh échoue (cookie périmé), `refreshToken()` nettoie la
 * session et relève — l'erreur remonte à l'appelant, qui l'affiche normalement.
 */
export async function fetchWithAuthRetry<T>(
  auth: AuthService,
  request: () => Observable<T>,
): Promise<T> {
  try {
    return await firstValueFrom(request());
  } catch (err) {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      await auth.refreshToken();
      return await firstValueFrom(request());
    }
    throw err;
  }
}
