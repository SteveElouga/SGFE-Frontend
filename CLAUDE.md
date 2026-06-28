# CLAUDE.md — Frontend Angular
## Système de Gestion de Facturation d'Eau

## Version & Stack

```
Angular          22.x (dernière stable — juin 2026)
TypeScript       5.9
Apollo Client    @apollo/client + apollo-angular
PWA              @angular/pwa
Test runner      Vitest (défaut Angular 22)
Styles           SCSS
UI               Angular Material 3
Icons            Material Icons
HTTP             httpResource (Angular 22 stable)
State            Signals (Angular 22 stable — PAS de NgRx)
Forms            Signal Forms (Angular 22 stable — PAS de ReactiveFormsModule)
Change Detection OnPush par défaut (Angular 22)
Zone.js          Désactivé (Zoneless architecture)
```

---

## Règle fondamentale

> Ce frontend communique EXCLUSIVEMENT avec l'API Gateway via GraphQL.
> Il ne connaît pas les microservices backend individuellement.
> Toutes les requêtes passent par un seul endpoint : `/graphql`

---

## Structure du projet

```
frontend/
│
├── src/
│   ├── app/
│   │   │
│   │   ├── core/                        # Services singleton, guards, interceptors
│   │   │   ├── auth/
│   │   │   │   ├── auth.service.ts      # JWT, login, logout, refresh
│   │   │   │   ├── auth.guard.ts        # Protection des routes
│   │   │   │   └── role.guard.ts        # Protection par rôle
│   │   │   ├── graphql/
│   │   │   │   ├── apollo.config.ts     # Configuration Apollo Client
│   │   │   │   └── graphql.module.ts
│   │   │   └── interceptors/
│   │   │       └── jwt.interceptor.ts   # Injection du JWT dans les requêtes
│   │   │
│   │   ├── shared/                      # Composants, pipes, directives réutilisables
│   │   │   ├── components/
│   │   │   │   ├── loading/
│   │   │   │   ├── error-message/
│   │   │   │   └── confirm-dialog/
│   │   │   ├── pipes/
│   │   │   │   ├── fcfa.pipe.ts         # Formatage montants FCFA
│   │   │   │   └── m3.pipe.ts           # Formatage consommation m³
│   │   │   └── models/                  # Interfaces TypeScript (types GraphQL)
│   │   │       ├── abonne.model.ts
│   │   │       ├── campagne.model.ts
│   │   │       ├── facture.model.ts
│   │   │       └── paiement.model.ts
│   │   │
│   │   ├── features/                    # Modules fonctionnels par rôle/domaine
│   │   │   ├── auth/                    # Login, logout
│   │   │   ├── dashboard/               # Tableau de bord (Admin + Comptable)
│   │   │   ├── abonnes/                 # Gestion abonnés (Admin)
│   │   │   ├── campagnes/               # Campagnes de relevé (Admin)
│   │   │   ├── terrain/                 # Interface agent terrain (Agent) MOBILE-FIRST
│   │   │   ├── facturation/             # Factures et PDF (Admin + Comptable)
│   │   │   ├── paiements/               # Paiements et impayés (Comptable)
│   │   │   └── espace-abonne/           # Page publique tokenisée (sans auth)
│   │   │
│   │   ├── graphql/                     # Queries et mutations GraphQL
│   │   │   ├── queries/
│   │   │   │   ├── abonnes.queries.ts
│   │   │   │   ├── campagnes.queries.ts
│   │   │   │   ├── factures.queries.ts
│   │   │   │   └── dashboard.queries.ts
│   │   │   └── mutations/
│   │   │       ├── abonnes.mutations.ts
│   │   │       ├── campagnes.mutations.ts
│   │   │       └── paiements.mutations.ts
│   │   │
│   │   ├── app.component.ts             # Composant racine (selectorless Angular 22)
│   │   ├── app.config.ts                # Configuration application (standalone)
│   │   └── app.routes.ts                # Routes lazy-loaded
│   │
│   ├── environments/
│   │   ├── environment.ts               # Développement
│   │   └── environment.prod.ts          # Production
│   │
│   ├── assets/
│   │   ├── logo/
│   │   └── icons/
│   │
│   ├── styles/
│   │   ├── _variables.scss              # Variables SCSS (couleurs, espacements)
│   │   ├── _mobile.scss                 # Mixins responsive mobile-first
│   │   └── global.scss                 # Styles globaux
│   │
│   ├── manifest.webmanifest            # Configuration PWA
│   └── index.html
│
├── CLAUDE.md                           # Ce fichier
├── .cursorrules                        # Règles Cursor pour le frontend
├── .cursorignore
├── .env.example
├── angular.json
├── tsconfig.json
├── vite.config.ts                      # Configuration Vitest (Angular 22 default)
└── package.json
```

---

## Angular 22 — Fonctionnalités clés à utiliser

### Signals (état réactif — OBLIGATOIRE)

```typescript
// ✅ Angular 22 — Utiliser les Signals pour tout état local
import { signal, computed, effect } from '@angular/core';

export class CampagneListComponent {
  // Signal writable
  campagnes = signal<Campagne[]>([]);
  searchTerm = signal<string>('');

  // Signal computed (dérivé)
  campagnesFiltrees = computed(() =>
    this.campagnes().filter(c =>
      c.nom.toLowerCase().includes(this.searchTerm().toLowerCase())
    )
  );

  // Effect (réaction aux changements)
  constructor() {
    effect(() => {
      console.log(`Campagnes filtrées : ${this.campagnesFiltrees().length}`);
    });
  }
}
```

### Signal Forms (formulaires — OBLIGATOIRE, PAS de ReactiveFormsModule)

```typescript
// ✅ Angular 22 — Signal Forms (stable)
import { signalForm, signalInput } from '@angular/forms';

export class SaisirIndexComponent {
  form = signalForm({
    nouveauIndex: signalInput<number>({
      validators: [required(), min(0)],
    }),
    observation: signalInput<string>(),
  });

  // Accès aux valeurs
  get nouveauIndex() { return this.form.controls.nouveauIndex.value(); }
  get isValid() { return this.form.valid(); }
}
```

### Selectorless Components (Angular 22 — OBLIGATOIRE pour nouveaux composants)

```typescript
// ✅ Angular 22 — Selectorless Component
import { Component } from '@angular/core';

@Component({
  // Pas de selector: 'app-...' nécessaire
  template: `<h1>Bonjour</h1>`,
  standalone: true,
})
export class AbonneCardComponent { }

// Import direct dans le template parent
// (pas de string selector à mémoriser)
```

### httpResource (récupération de données — OBLIGATOIRE)

```typescript
// ✅ Angular 22 — httpResource pour les données
import { httpResource } from '@angular/core';

export class DashboardComponent {
  // Récupération automatique avec état loading/error/success
  dashboardData = httpResource(() => '/api/dashboard');

  // Accès aux états
  isLoading = this.dashboardData.isLoading;
  hasError = this.dashboardData.error;
  data = this.dashboardData.value;
}
```

### Zoneless (PAS de Zone.js — OBLIGATOIRE)

```typescript
// app.config.ts
import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(), // Zoneless Angular 22
    // ...
  ]
};
```

---

## GraphQL avec Apollo Client

### Configuration Apollo

```typescript
// core/graphql/apollo.config.ts
import { ApolloClientOptions, InMemoryCache } from '@apollo/client/core';
import { APOLLO_OPTIONS } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';

export function apolloFactory(httpLink: HttpLink): ApolloClientOptions<unknown> {
  return {
    link: httpLink.create({ uri: '/graphql' }),
    cache: new InMemoryCache(),
  };
}

export const apolloProviders = [
  {
    provide: APOLLO_OPTIONS,
    useFactory: apolloFactory,
    deps: [HttpLink],
  },
];
```

### Pattern Query GraphQL

```typescript
// graphql/queries/campagnes.queries.ts
import { gql } from '@apollo/client/core';

export const GET_CAMPAGNES = gql`
  query GetCampagnes {
    campagnes {
      id
      nom
      periodeMois
      periodeAnnee
      statut
      datePlanifiee
    }
  }
`;

export const GET_PROGRESSION = gql`
  query GetProgression($campagneId: ID!) {
    progression(campagneId: $campagneId) {
      totalAbonnes
      nbReleves
      nbEnAttente
      pourcentage
    }
  }
`;
```

### Pattern Mutation GraphQL

```typescript
// graphql/mutations/campagnes.mutations.ts
import { gql } from '@apollo/client/core';

export const SAISIR_INDEX = gql`
  mutation SaisirIndex($input: SaisirIndexInput!) {
    saisirIndex(input: $input) {
      id
      consommation
      statut
      dateReleve
    }
  }
`;
```

### Utilisation dans un composant

```typescript
import { Apollo } from 'apollo-angular';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';
import { signal, inject } from '@angular/core';

export class CampagneListComponent {
  private apollo = inject(Apollo);

  campagnes = signal<Campagne[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  chargerCampagnes(): void {
    this.loading.set(true);
    this.apollo.query({ query: GET_CAMPAGNES }).subscribe({
      next: ({ data }) => {
        this.campagnes.set(data.campagnes);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Erreur lors du chargement des campagnes');
        this.loading.set(false);
      }
    });
  }
}
```

---

## PWA — Configuration mobile-first

### Manifest

```json
// src/manifest.webmanifest
{
  "name": "Facturation Eau",
  "short_name": "Eau",
  "theme_color": "#1976d2",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/",
  "icons": [
    { "src": "assets/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Breakpoints mobile-first (SCSS)

```scss
// styles/_mobile.scss
$breakpoint-mobile:  320px;
$breakpoint-tablet:  768px;
$breakpoint-desktop: 1024px;

// Mixins mobile-first
@mixin tablet { @media (min-width: #{$breakpoint-tablet}) { @content; } }
@mixin desktop { @media (min-width: #{$breakpoint-desktop}) { @content; } }

// Usage
.container {
  padding: 8px;                    // Mobile (défaut)
  @include tablet { padding: 16px; }
  @include desktop { padding: 24px; }
}
```

---

## Authentification & Rôles

### Service Auth avec Signals

```typescript
// core/auth/auth.service.ts
import { Injectable, signal, computed } from '@angular/core';

export type Role = 'ADMIN' | 'AGENT' | 'COMPTABLE';

interface UserPayload {
  userId: string;
  username: string;
  role: Role;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<UserPayload | null>(null);

  // Signaux publics
  user = this._user.asReadonly();
  isAuthenticated = computed(() => this._user() !== null);
  role = computed(() => this._user()?.role ?? null);

  isAdmin = computed(() => this.role() === 'ADMIN');
  isAgent = computed(() => this.role() === 'AGENT');
  isComptable = computed(() => this.role() === 'COMPTABLE');
}
```

---

## Routes — Lazy loading par rôle

```typescript
// app.routes.ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component') },
  {
    path: 'dashboard',
    canActivate: [authGuard, roleGuard(['ADMIN', 'COMPTABLE'])],
    loadComponent: () => import('./features/dashboard/dashboard.component'),
  },
  {
    path: 'terrain',
    canActivate: [authGuard, roleGuard(['ADMIN', 'AGENT'])],
    loadComponent: () => import('./features/terrain/terrain.component'),
  },
  {
    path: 'espace/:token',   // Page publique — pas de guard
    loadComponent: () => import('./features/espace-abonne/espace-abonne.component'),
  },
  { path: '**', redirectTo: 'login' },
];
```

---

## Commandes utiles

```bash
# Créer le projet Angular 22 avec PWA
ng new frontend --standalone --routing --style=scss
cd frontend
ng add @angular/pwa
ng add apollo-angular

# Générer un composant (selectorless Angular 22)
ng generate component features/terrain/saisir-index --standalone

# Lancer le serveur de dev
ng serve --port 4200

# Build production PWA
ng build --configuration production

# Tests avec Vitest (défaut Angular 22)
ng test
ng test --coverage

# Vérifier les types TypeScript
npx tsc --noEmit
```

---

## Interface Terrain — Priorité absolue mobile

L'interface agent (`features/terrain/`) est la plus critique du projet.

**Contraintes strictes :**
- Cible : smartphones 5 pouces minimum (320px-390px)
- Réseau : souvent instable sur le terrain
- Interactions : maximum 3 taps pour saisir un index
- Clavier : numérique uniquement pour la saisie d'index
- Feedback : visuel immédiat après chaque action

**Flux de saisie (3 interactions maximum) :**
```
1. Agent choisit un abonné dans la liste (tap)
2. Agent saisit le nouvel index (clavier numérique)
3. Agent valide (tap sur "Confirmer")
```

---

## Variables d'environnement

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  graphqlUrl: 'http://localhost:8000/graphql',
  appName: 'Facturation Eau',
};

// environments/environment.prod.ts
export const environment = {
  production: true,
  graphqlUrl: 'https://[VOTRE_URL_NGROK]/graphql',
  appName: 'Facturation Eau',
};
```
