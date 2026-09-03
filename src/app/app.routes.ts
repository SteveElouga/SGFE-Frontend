import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { AuthService } from './core/auth/auth.service';
import { landingRouteFor } from './core/auth/landing';

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
  {
    // Alias pour les liens WhatsApp : /activer-compte?phone=%2B237...
    path: 'activer-compte',
    loadComponent: () =>
      import('./features/auth/activate-otp/activate-otp.component').then(
        (m) => m.ActivateOtpComponent,
      ),
  },
  {
    // Espace abonné public (lien WhatsApp tokenisé) — AUCUN authGuard.
    path: 'espace/:token',
    loadComponent: () =>
      import('./features/espace-abonne/espace-abonne.component').then(
        (m) => m.EspaceAbonneComponent,
      ),
  },

  // ── Authenticated shell ────────────────────────────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      // Accueil rôle-aware : ADMIN/COMPTABLE → dashboard, AGENT → terrain,
      // SUPERVISEUR → campagnes (évite d'envoyer un rôle sur un écran interdit).
      { path: '', pathMatch: 'full', redirectTo: () => landingRouteFor(inject(AuthService).role()) },
      {
        path: 'dashboard',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        loadComponent: () =>
          import('./features/dashboard/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'terrain',
        canActivate: [roleGuard(['ADMIN', 'AGENT', 'SUPERVISEUR'])],
        loadComponent: () =>
          import('./features/terrain/terrain.component').then((m) => m.TerrainComponent),
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
              import('./features/utilisateurs/list/utilisateurs-list.component').then(
                (m) => m.UtilisateursListComponent,
              ),
          },
          {
            path: 'nouveau',
            loadComponent: () =>
              import('./features/utilisateurs/form/utilisateur-form.component').then(
                (m) => m.UtilisateurFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/utilisateurs/edit/utilisateur-edit.component').then(
                (m) => m.UtilisateurEditComponent,
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
            path: 'nouvelle',
            canActivate: [roleGuard(['ADMIN', 'SUPERVISEUR'])],
            loadComponent: () =>
              import('./features/campagnes/form/campagne-form.component').then(
                (m) => m.CampagneFormComponent,
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
      {
        path: 'factures',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/facturation/list/factures-list.component').then(
                (m) => m.FacturesListComponent,
              ),
          },
          {
            path: 'campagne/:campagneId',
            loadComponent: () =>
              import('./features/facturation/list/factures-list.component').then(
                (m) => m.FacturesListComponent,
              ),
          },
          {
            path: ':factureId',
            loadComponent: () =>
              import('./features/facturation/detail/facture-detail.component').then(
                (m) => m.FactureDetailComponent,
              ),
          },
        ],
      },
      {
        path: 'paiements',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        loadComponent: () =>
          import('./features/paiements/paiements-list.component').then(
            (m) => m.PaiementsListComponent,
          ),
      },
      {
        path: 'envois',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        loadComponent: () =>
          import('./features/envois/envois-list.component').then(
            (m) => m.EnvoisListComponent,
          ),
      },
      {
        path: 'communication',
        canActivate: [roleGuard(['ADMIN'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/communication/list/diffusions-list.component').then(
                (m) => m.DiffusionsListComponent,
              ),
          },
          {
            path: 'nouvelle',
            loadComponent: () =>
              import('./features/communication/form/diffusion-form.component').then(
                (m) => m.DiffusionFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/communication/detail/diffusion-detail.component').then(
                (m) => m.DiffusionDetailComponent,
              ),
          },
        ],
      },
      {
        path: 'rapports',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        loadComponent: () =>
          import('./features/rapports/rapports-list.component').then(
            (m) => m.RapportsListComponent,
          ),
      },
      {
        path: 'impayes',
        canActivate: [roleGuard(['ADMIN', 'COMPTABLE'])],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/impayes/impayes-list.component').then(
                (m) => m.ImpayesListComponent,
              ),
          },
          {
            path: ':factureId/relances',
            loadComponent: () =>
              import('./features/impayes/relances/relances-historique.component').then(
                (m) => m.RelancesHistoriqueComponent,
              ),
          },
        ],
      },
      {
        path: 'configuration',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/configuration/configuration.component').then(
            (m) => m.ConfigurationComponent,
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then(
            (m) => m.NotificationsComponent,
          ),
      },
      {
        path: 'profil',
        loadComponent: () =>
          import('./features/profil/profil.component').then(
            (m) => m.ProfilComponent,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
