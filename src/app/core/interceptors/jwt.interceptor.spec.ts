import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { jwtInterceptor } from './jwt.interceptor';

/**
 * L'access token (détenu en mémoire uniquement par `AuthService`, jamais en
 * `localStorage` — voir son commentaire de tête) doit partir vers notre
 * propre origine et nulle part ailleurs. Il n'existe pas de liste d'exclusion
 * par endpoint (login, espace-abonné) : le mécanisme réel est plus simple et
 * suffisant — l'en-tête n'est ajouté que (1) si un token existe déjà en
 * mémoire, et (2) vers une URL de même origine. Une requête de login, avant
 * toute connexion, n'a justement pas encore de token : le cas (1) suffit à
 * la couvrir sans liste dédiée.
 */

function requeteInterceptee(url: string, token: string | null) {
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: { accessToken: () => token } }],
  });

  const requete = new HttpRequest('GET', url);
  const next = vi.fn((r: HttpRequest<unknown>) => of(r));

  let capturee: HttpRequest<unknown> | undefined;
  TestBed.runInInjectionContext(() => jwtInterceptor(requete, next as never)).subscribe((r) => {
    capturee = r as unknown as HttpRequest<unknown>;
  });

  return { next, capturee: capturee! };
}

describe('jwtInterceptor', () => {
  it('attache le token en en-tête Authorization sur une requête vers notre origine', () => {
    const { capturee } = requeteInterceptee('/graphql', 'jwt-abc123');
    expect(capturee.headers.get('Authorization')).toBe('Bearer jwt-abc123');
  });

  it('requête anonyme (aucun token en mémoire) : passe telle quelle, sans en-tête', () => {
    const { next, capturee } = requeteInterceptee('/graphql', null);
    expect(capturee.headers.has('Authorization')).toBe(false);
    // Pas de clonage inutile quand il n'y a rien à ajouter.
    expect(next).toHaveBeenCalledWith(capturee);
  });

  it('n’attache PAS le token vers une URL absolue (autre origine)', () => {
    const { capturee } = requeteInterceptee('https://cdn.exemple.com/avatar.png', 'jwt-abc123');
    expect(capturee.headers.has('Authorization')).toBe(false);
  });

  it('n’attache PAS le token vers une URL protocol-relative (//hote)', () => {
    const { capturee } = requeteInterceptee('//hote-externe.test/chemin', 'jwt-abc123');
    expect(capturee.headers.has('Authorization')).toBe(false);
  });

  it('attache le token sur les chemins REST hors-GraphQL de même origine (exports, PDF)', () => {
    const { capturee } = requeteInterceptee('/rapports/factures.csv', 'jwt-abc123');
    expect(capturee.headers.get('Authorization')).toBe('Bearer jwt-abc123');
  });
});
