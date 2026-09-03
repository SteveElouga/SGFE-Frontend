import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { fetchWithAuthRetry } from './rest-auth-retry';
import type { AuthService } from './auth.service';

/**
 * Même flux 401 → refresh → retry que `auth-error.link.spec.ts`, mais côté
 * REST : les 4 téléchargements binaires hors-GraphQL (PDF facture, exports
 * CSV/PDF — voir `exports.service.ts`, `facture-pdf.service.ts`) ne passent
 * pas par l'ErrorLink Apollo.
 */

function auth(overrides: Partial<AuthService> = {}): AuthService {
  return { refreshToken: vi.fn().mockResolvedValue(undefined), ...overrides } as unknown as AuthService;
}

describe('fetchWithAuthRetry', () => {
  it('rafraîchit silencieusement sur 401 puis rejoue la requête ORIGINALE', async () => {
    const a = auth();
    let appel = 0;
    const requete = vi.fn(() => {
      appel++;
      return appel === 1
        ? throwError(() => new HttpErrorResponse({ status: 401 }))
        : of({ body: 'fichier.pdf' });
    });

    const resultat = await fetchWithAuthRetry(a, requete);

    expect(a.refreshToken).toHaveBeenCalledTimes(1);
    expect(requete).toHaveBeenCalledTimes(2);
    expect(resultat).toEqual({ body: 'fichier.pdf' });
  });

  it('un rafraîchissement qui échoue lui-même propage l’erreur sans rejouer la requête', async () => {
    const a = auth({ refreshToken: vi.fn().mockRejectedValue(new Error('refresh token expiré')) });
    const requete = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));

    await expect(fetchWithAuthRetry(a, requete)).rejects.toThrow('refresh token expiré');

    expect(a.refreshToken).toHaveBeenCalledTimes(1);
    expect(requete).toHaveBeenCalledTimes(1); // jamais rejouée : le refresh a échoué avant
  });

  it('une erreur autre que 401 ne déclenche aucun rafraîchissement', async () => {
    const a = auth();
    const requete = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));

    await expect(fetchWithAuthRetry(a, requete)).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(a.refreshToken).not.toHaveBeenCalled();
    expect(requete).toHaveBeenCalledTimes(1);
  });

  /**
   * CONSTAT (non corrigé — hors périmètre d'un ajout de tests) : contrairement
   * à `auth-error.link.ts` (GraphQL), ce helper ne mutualise PAS le
   * rafraîchissement entre appels concurrents — chacun appelle
   * `auth.refreshToken()` indépendamment. Pour les 4 usages réels de ce
   * helper (PDF/CSV, déclenchés un par un par un clic utilisateur), le risque
   * de concurrence réelle est faible ; documenté ici pour qu'un futur
   * durcissement (ex. mutualiser via une promesse partagée, comme le fait
   * déjà `auth-error.link.ts`) parte d'un comportement mesuré plutôt que supposé.
   */
  it('constat : deux appels concurrents en 401 déclenchent chacun leur propre rafraîchissement', async () => {
    const a = auth();
    const requete401 = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await Promise.allSettled([fetchWithAuthRetry(a, requete401), fetchWithAuthRetry(a, requete401)]);

    expect(a.refreshToken).toHaveBeenCalledTimes(2);
  });
});
