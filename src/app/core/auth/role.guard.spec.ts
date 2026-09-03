import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { Role } from '../../shared/models/user.model';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

/**
 * `roleGuard` protège la quasi-totalité des routes authentifiées
 * (`app.routes.ts`). Ces tests couvrent, pour un échantillon représentatif de
 * routes réelles, chaque rôle du domaine (ADMIN/AGENT/COMPTABLE/SUPERVISEUR) :
 * le rôle autorisé passe, le rôle non autorisé est renvoyé vers SON écran
 * d'accueil (pas /login — un rôle authentifié qui atterrit sur /login se lit
 * comme une déconnexion, voir le commentaire de role.guard.ts), et un
 * visiteur non authentifié est renvoyé vers /login.
 *
 * Combinaisons réellement utilisées dans app.routes.ts, toutes couvertes
 * ci-dessous : {ADMIN,COMPTABLE} (dashboard), {ADMIN,AGENT,SUPERVISEUR}
 * (terrain), {ADMIN} (abonnés/utilisateurs/configuration), {ADMIN,SUPERVISEUR}
 * (création de campagne).
 */

function setup(role: Role | null) {
  const createUrlTree = vi.fn((commands: string[]) => ({ commands }));
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { role: () => role } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  return { createUrlTree };
}

function activer(rolesAutorises: Role[], role: Role | null) {
  const { createUrlTree } = setup(role);
  const resultat = TestBed.runInInjectionContext(() =>
    roleGuard(rolesAutorises)(null as never, null as never),
  );
  return { resultat, createUrlTree };
}

describe('roleGuard', () => {
  // ── /dashboard : ADMIN, COMPTABLE ────────────────────────────────────────
  describe('route dashboard — roleGuard([ADMIN, COMPTABLE])', () => {
    it('ADMIN passe', () => {
      const { resultat } = activer(['ADMIN', 'COMPTABLE'], 'ADMIN');
      expect(resultat).toBe(true);
    });

    it('COMPTABLE passe', () => {
      const { resultat } = activer(['ADMIN', 'COMPTABLE'], 'COMPTABLE');
      expect(resultat).toBe(true);
    });

    it('AGENT est renvoyé vers son écran d’accueil (/terrain), pas /login', () => {
      const { resultat, createUrlTree } = activer(['ADMIN', 'COMPTABLE'], 'AGENT');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/terrain']);
    });

    it('SUPERVISEUR est renvoyé vers son écran d’accueil (/campagnes)', () => {
      const { resultat, createUrlTree } = activer(['ADMIN', 'COMPTABLE'], 'SUPERVISEUR');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/campagnes']);
    });
  });

  // ── /terrain : ADMIN, AGENT, SUPERVISEUR ─────────────────────────────────
  describe('route terrain — roleGuard([ADMIN, AGENT, SUPERVISEUR])', () => {
    it('AGENT passe', () => {
      const { resultat } = activer(['ADMIN', 'AGENT', 'SUPERVISEUR'], 'AGENT');
      expect(resultat).toBe(true);
    });

    it('SUPERVISEUR passe', () => {
      const { resultat } = activer(['ADMIN', 'AGENT', 'SUPERVISEUR'], 'SUPERVISEUR');
      expect(resultat).toBe(true);
    });

    it('ADMIN passe', () => {
      const { resultat } = activer(['ADMIN', 'AGENT', 'SUPERVISEUR'], 'ADMIN');
      expect(resultat).toBe(true);
    });

    it('COMPTABLE est renvoyé vers /dashboard', () => {
      const { resultat, createUrlTree } = activer(['ADMIN', 'AGENT', 'SUPERVISEUR'], 'COMPTABLE');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  // ── /abonnes, /utilisateurs, /configuration : ADMIN seul ────────────────
  describe('route abonnés — roleGuard([ADMIN])', () => {
    it('ADMIN passe', () => {
      const { resultat } = activer(['ADMIN'], 'ADMIN');
      expect(resultat).toBe(true);
    });

    it('COMPTABLE est renvoyé vers /dashboard', () => {
      const { resultat, createUrlTree } = activer(['ADMIN'], 'COMPTABLE');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });

    it('AGENT est renvoyé vers /terrain', () => {
      const { resultat, createUrlTree } = activer(['ADMIN'], 'AGENT');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/terrain']);
    });

    it('SUPERVISEUR est renvoyé vers /campagnes', () => {
      const { resultat, createUrlTree } = activer(['ADMIN'], 'SUPERVISEUR');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/campagnes']);
    });
  });

  // ── /campagnes/nouvelle : ADMIN, SUPERVISEUR ─────────────────────────────
  describe('route création de campagne — roleGuard([ADMIN, SUPERVISEUR])', () => {
    it('SUPERVISEUR passe', () => {
      const { resultat } = activer(['ADMIN', 'SUPERVISEUR'], 'SUPERVISEUR');
      expect(resultat).toBe(true);
    });

    it('AGENT (qui voit la liste des campagnes mais pas leur création) est renvoyé vers /terrain', () => {
      const { resultat, createUrlTree } = activer(['ADMIN', 'SUPERVISEUR'], 'AGENT');
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/terrain']);
    });
  });

  // ── Visiteur non authentifié ─────────────────────────────────────────────
  describe('utilisateur non authentifié', () => {
    it('est renvoyé vers /login, quelle que soit la route', () => {
      const { resultat, createUrlTree } = activer(['ADMIN'], null);
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/login']);
    });

    it('même sur une route ouverte à plusieurs rôles', () => {
      const { resultat, createUrlTree } = activer(['ADMIN', 'AGENT', 'SUPERVISEUR', 'COMPTABLE'], null);
      expect(resultat).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/login']);
    });
  });
});
