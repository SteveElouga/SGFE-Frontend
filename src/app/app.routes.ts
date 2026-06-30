import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  // ── Auth (no shell) ────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'set-password',
    data: { mode: 'activate' },
    loadComponent: () =>
      import('./features/auth/set-password/set-password.component').then(
        (m) => m.SetPasswordComponent,
      ),
  },
  {
    path: 'reset-password',
    data: { mode: 'reset' },
    loadComponent: () =>
      import('./features/auth/set-password/set-password.component').then(
        (m) => m.SetPasswordComponent,
      ),
  },
  {
    path: 'activate',
    loadComponent: () =>
      import('./features/auth/activate-otp/activate-otp.component').then(
        (m) => m.ActivateOtpComponent,
      ),
  },

  // ── Authenticated shell ────────────────────────────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'abonnes',
        canActivate: [roleGuard(['ADMIN'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/abonnes/list/abonnes-list.component').then(
                (m) => m.AbonnesListComponent,
              ),
          },
          {
            path: 'nouveau',
            data: { mode: 'create' },
            loadComponent: () =>
              import('./features/abonnes/form/abonne-form.component').then(
                (m) => m.AbonneFormComponent,
              ),
          },
          {
            path: ':id/modifier',
            data: { mode: 'edit' },
            loadComponent: () =>
              import('./features/abonnes/form/abonne-form.component').then(
                (m) => m.AbonneFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/abonnes/detail/abonne-detail.component').then(
                (m) => m.AbonneDetailComponent,
              ),
          },
        ],
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard(['ADMIN'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/utilisateurs/utilisateurs-list.component').then(
                (m) => m.UtilisateursListComponent,
              ),
          },
          {
            path: 'nouveau',
            loadComponent: () =>
              import('./features/utilisateurs/utilisateur-form.component').then(
                (m) => m.UtilisateurFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/utilisateurs/utilisateur-form.component').then(
                (m) => m.UtilisateurFormComponent,
              ),
          },
        ],
      },
      {
        path: 'campagnes',
        canActivate: [roleGuard(['ADMIN', 'SUPERVISEUR', 'AGENT'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/campagnes/list/campagnes-list.component').then(
                (m) => m.CampagnesListComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/campagnes/detail/campagne-detail.component').then(
                (m) => m.CampagneDetailComponent,
              ),
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
