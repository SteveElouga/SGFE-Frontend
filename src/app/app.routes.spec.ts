import { TestBed } from '@angular/core/testing';
import { Router, Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { Role } from './shared/models/user.model';

/**
 * Test structurel : pas besoin de monter l'application pour vérifier qu'une
 * route existe, sous le bon garde, avec le bon rôle. Le risque réel n'est pas
 * une faute de frappe dans un chemin — TypeScript la verrait — mais d'oublier
 * un rôle dans `roleGuard([...])`, ou de retirer un `canActivate` par erreur
 * lors d'un remaniement : rien ne le signale à la compilation.
 *
 * Chaque garde `roleGuard(...)` est invoqué directement (comme dans
 * `role.guard.spec.ts`) pour vérifier le jeu de rôles réellement câblé sur
 * CETTE route, pas seulement que « un garde existe ».
 */

function enfant(parent: Route | undefined, path: string): Route {
  const trouve = parent?.children?.find((r) => r.path === path);
  if (!trouve) throw new Error(`Route enfant "${path}" introuvable sous "${parent?.path}"`);
  return trouve;
}

function racine(path: string): Route {
  const trouve = routes.find((r) => r.path === path);
  if (!trouve) throw new Error(`Route "${path}" introuvable`);
  return trouve;
}

function activer(route: Route, role: Role | null, index = 0): { resultat: unknown; createUrlTree: ReturnType<typeof vi.fn> } {
  const createUrlTree = vi.fn((commands: string[]) => ({ commands }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { role: () => role, isAuthenticated: () => role !== null } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const guard = route.canActivate?.[index] as (...args: unknown[]) => unknown;
  const resultat = TestBed.runInInjectionContext(() => guard(null as never, null as never));
  return { resultat, createUrlTree };
}

describe('app.routes — routes publiques (sans authGuard)', () => {
  it.each(['login', 'forgot-password', 'set-password', 'reset-password', 'activate', 'activer-compte'])(
    '%s n’a aucun garde',
    (path) => {
      expect(racine(path).canActivate).toBeUndefined();
    },
  );

  it('set-password porte le mode "activate"', () => {
    expect(racine('set-password').data).toEqual({ mode: 'activate' });
  });

  it('reset-password porte le mode "reset"', () => {
    expect(racine('reset-password').data).toEqual({ mode: 'reset' });
  });

  it('espace/:token (espace abonné public) n’a aucun garde', () => {
    const route = routes.find((r) => r.path === 'espace/:token');
    expect(route).toBeDefined();
    expect(route!.canActivate).toBeUndefined();
  });

  it('la confirmation de paiement simulée n’a aucun garde', () => {
    const route = routes.find((r) => r.path === 'espace/:token/paiement/:sessionId/confirmer');
    expect(route).toBeDefined();
    expect(route!.canActivate).toBeUndefined();
  });

  it('la route catch-all redirige vers /login', () => {
    const route = routes.find((r) => r.path === '**');
    expect(route?.redirectTo).toBe('login');
  });

  it.each(['login', 'forgot-password', 'set-password', 'reset-password', 'activate', 'activer-compte'])(
    '%s a une fonction de chargement paresseux',
    (path) => {
      expect(typeof racine(path).loadComponent).toBe('function');
    },
  );
});

describe('app.routes — coquille authentifiée', () => {
  const shell = racine('');

  it('exige authGuard', () => {
    expect(shell.canActivate).toEqual([authGuard]);
  });

  it('a une fonction de chargement paresseux', () => {
    expect(typeof shell.loadComponent).toBe('function');
  });

  it('la route index (redirection d’accueil) envoie chaque rôle sur SON écran', () => {
    const index = enfant(shell, '');
    expect(index.pathMatch).toBe('full');
    expect(typeof index.redirectTo).toBe('function');

    const cas: Array<[Role | null, string]> = [
      ['ADMIN', '/dashboard'],
      ['COMPTABLE', '/dashboard'],
      ['AGENT', '/terrain'],
      ['SUPERVISEUR', '/campagnes'],
      [null, '/login'],
    ];
    for (const [role, attendu] of cas) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { role: () => role } }] });
      const resultat = TestBed.runInInjectionContext(() => (index.redirectTo as (...a: unknown[]) => string)());
      expect(resultat).toBe(attendu);
    }
  });
});

describe('app.routes — rôles câblés par route', () => {
  type Cas = { chemin: string; route: () => Route; autorises: Role[]; refuse: Role };

  const cas: Cas[] = [
    { chemin: 'dashboard', route: () => enfant(racine(''), 'dashboard'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'AGENT' },
    { chemin: 'terrain', route: () => enfant(racine(''), 'terrain'), autorises: ['ADMIN', 'AGENT', 'SUPERVISEUR'], refuse: 'COMPTABLE' },
    { chemin: 'abonnes', route: () => enfant(racine(''), 'abonnes'), autorises: ['ADMIN'], refuse: 'COMPTABLE' },
    { chemin: 'utilisateurs', route: () => enfant(racine(''), 'utilisateurs'), autorises: ['ADMIN'], refuse: 'AGENT' },
    { chemin: 'campagnes', route: () => enfant(racine(''), 'campagnes'), autorises: ['ADMIN', 'SUPERVISEUR', 'AGENT'], refuse: 'COMPTABLE' },
    { chemin: 'factures', route: () => enfant(racine(''), 'factures'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'AGENT' },
    { chemin: 'paiements', route: () => enfant(racine(''), 'paiements'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'SUPERVISEUR' },
    { chemin: 'envois', route: () => enfant(racine(''), 'envois'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'AGENT' },
    { chemin: 'communication', route: () => enfant(racine(''), 'communication'), autorises: ['ADMIN'], refuse: 'COMPTABLE' },
    { chemin: 'rapports', route: () => enfant(racine(''), 'rapports'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'AGENT' },
    { chemin: 'impayes', route: () => enfant(racine(''), 'impayes'), autorises: ['ADMIN', 'COMPTABLE'], refuse: 'SUPERVISEUR' },
    { chemin: 'configuration', route: () => enfant(racine(''), 'configuration'), autorises: ['ADMIN'], refuse: 'COMPTABLE' },
  ];

  it.each(cas)('$chemin : les rôles autorisés passent', ({ route, autorises }) => {
    const r = route();
    for (const role of autorises) {
      const { resultat } = activer(r, role);
      expect(resultat).toBe(true);
    }
  });

  it.each(cas)('$chemin : un rôle non listé est renvoyé vers son propre écran d’accueil', ({ route, refuse }) => {
    const r = route();
    const { resultat, createUrlTree } = activer(r, refuse);
    expect(resultat).not.toBe(true);
    expect(createUrlTree).toHaveBeenCalled();
  });

  it('campagnes/nouvelle est plus strict que campagnes : un AGENT voit la liste mais pas la création', () => {
    const campagnes = enfant(racine(''), 'campagnes');
    const nouvelle = enfant(campagnes, 'nouvelle');
    expect(activer(campagnes, 'AGENT').resultat).toBe(true);
    expect(activer(nouvelle, 'AGENT').resultat).not.toBe(true);
    expect(activer(nouvelle, 'SUPERVISEUR').resultat).toBe(true);
  });

  it.each(['notifications', 'profil'])('%s est accessible à tout rôle authentifié (aucun roleGuard)', (path) => {
    const route = enfant(racine(''), path);
    expect(route.canActivate).toBeUndefined();
  });
});

describe('app.routes — arborescence des sous-routes', () => {
  it('abonnes expose liste, création, modification et détail', () => {
    const abonnes = enfant(racine(''), 'abonnes');
    const chemins = abonnes.children?.map((c) => c.path);
    expect(chemins).toEqual(['', 'nouveau', ':id/modifier', ':id']);
  });

  it('factures expose liste, liste par campagne et détail', () => {
    const factures = enfant(racine(''), 'factures');
    const chemins = factures.children?.map((c) => c.path);
    expect(chemins).toEqual(['', 'campagne/:campagneId', ':factureId']);
  });

  it('impayes expose liste et historique des relances', () => {
    const impayes = enfant(racine(''), 'impayes');
    const chemins = impayes.children?.map((c) => c.path);
    expect(chemins).toEqual(['', ':factureId/relances']);
  });
});
