import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../../shared/models/user.model';
import { AuthService } from './auth.service';

export function roleGuard(allowedRoles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const role = auth.role();
    if (role && allowedRoles.includes(role)) {
      return true;
    }

    return router.createUrlTree(['/login']);
  };
}
