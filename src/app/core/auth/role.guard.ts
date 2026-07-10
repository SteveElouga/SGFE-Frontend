import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../../shared/models/user.model';
import { AuthService } from './auth.service';
import { landingRouteFor } from './landing';

export function roleGuard(allowedRoles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const role = auth.role();
    if (role && allowedRoles.includes(role)) {
      return true;
    }

    // Rôle authentifié mais non autorisé → renvoi vers son écran d'accueil (et
    // non /login, qui simulerait une déconnexion). Non authentifié → /login.
    return router.createUrlTree([landingRouteFor(role)]);
  };
}
