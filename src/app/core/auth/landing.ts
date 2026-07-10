import { Role } from '../../shared/models/user.model';

/**
 * Écran d'accueil par rôle (source unique, partagée par le login, la
 * redirection racine et le garde de rôle). Aligné sur la matrice de permissions
 * (SGFE-backend/CLAUDE.md) : le SUPERVISEUR et l'AGENT n'ont pas le dashboard —
 * ils atterrissent sur leur écran utile.
 */
export const LANDING_ROUTE_BY_ROLE: Record<Role, string> = {
  ADMIN: '/dashboard',
  COMPTABLE: '/dashboard',
  AGENT: '/terrain',
  SUPERVISEUR: '/campagnes',
};

/** Route d'accueil du rôle donné, ou /login si l'utilisateur n'est pas identifié. */
export function landingRouteFor(role: Role | null): string {
  return role ? LANDING_ROUTE_BY_ROLE[role] : '/login';
}
