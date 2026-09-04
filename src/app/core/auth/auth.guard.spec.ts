import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * `authGuard` protège l'ensemble de la coquille authentifiée (`app.routes.ts`,
 * route racine `''`). Il ne connaît pas les rôles — seulement l'authentification.
 */
function setup(isAuthenticated: boolean) {
  const createUrlTree = vi.fn((commands: string[]) => ({ commands }));
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isAuthenticated: () => isAuthenticated } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const resultat = TestBed.runInInjectionContext(() => authGuard(null as never, null as never));
  return { resultat, createUrlTree };
}

describe('authGuard', () => {
  it('laisse passer un utilisateur authentifié', () => {
    const { resultat, createUrlTree } = setup(true);
    expect(resultat).toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('renvoie un utilisateur non authentifié vers /login', () => {
    const { resultat, createUrlTree } = setup(false);
    expect(resultat).not.toBe(true);
    expect(createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('l’arbre d’URL renvoyé est bien celui produit par le routeur', () => {
    const { resultat } = setup(false);
    expect(resultat).toEqual({ commands: ['/login'] });
  });
});
