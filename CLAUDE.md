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

> ⚠️ `APOLLO_OPTIONS` seul ne suffit pas : il faut `provideApollo()`
> (apollo-angular ≥ 14), qui enregistre aussi le service `Apollo`
> lui-même. L'oublier produit une erreur silencieuse au démarrage
> (`NG0201: No provider found for Apollo`) et un écran blanc.

```typescript
// core/graphql/apollo.config.ts
import { inject } from '@angular/core';
import { ApolloClient, InMemoryCache } from '@apollo/client/core';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';

function apolloOptionsFactory(): ApolloClient.Options {
  const httpLink = inject(HttpLink);
  return {
    link: httpLink.create({ uri: environment.graphqlUrl, withCredentials: true }),
    cache: new InMemoryCache(),
  };
}

export const apolloProviders = [provideApollo(apolloOptionsFactory)];
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

## Budgets de build — seuils mesurés, pas hérités

`angular.json` porte deux budgets. Ce ne sont **pas** les valeurs par défaut de
la CLI : elles ont été recalibrées le 27 août 2026 sur des mesures réelles,
après avoir cherché le gaspillage plutôt que de déplacer le seuil.

| Budget | Alerte | Erreur | Mesuré ce jour-là |
|---|---|---|---|
| `initial` | 680 kB | 800 kB | **652,68 kB** (165,14 kB transférés) |
| `anyComponentStyle` | 21 kB | 26 kB | **20,10 kB** (`campagne-detail`) |

**Pourquoi 680 et non 500.** Le bundle initial est à 96 % du framework :
Angular 282 kB (core, router, common), Apollo + GraphQL 152 kB, runtime PrimeNG
43 kB, rxjs 23 kB, ngx-translate 16 kB. Le code de l'application elle-même pèse
**24 kB**. Descendre sous 500 kB demanderait d'abandonner Apollo, que la règle
fondamentale de ce projet impose. Le vrai gaspillage a été trouvé et retiré :
le préréglage Aura importé en bloc coûtait 76 kB de jetons pour 77 composants
jamais rendus (voir `core/theme/aquabill-preset.ts`).

**Pourquoi 20 et non 12.** L'hypothèse d'une duplication massive entre feuilles
de composants est fausse : mesurée, elle est de **6,3 %**. Déduplication
complète, la pire feuille passerait de 23,4 à 21,8 kB — toujours au-dessus de
12. Ces écrans ont simplement beaucoup de styles distincts.

**Pourquoi 21 et non 20, le 28 août 2026.** L'échelle typographique et les jetons
d'ombre ont remplacé 704 tailles et 83 ombres écrites en dur. Un jeton coûte plus
de caractères que la valeur qu'il remplace — `var(--texte-md)` contre `13px` — et
les noms de variables CSS ne se minifient pas. Sur `campagne-detail`, 57
déclarations converties pèsent **+523 octets** de source, soit +620 octets de CSS
compilé : 19,48 → 20,10 kB. Le gaspillage a été cherché avant de toucher au
seuil, comme la règle ci-dessous l'exige : 938 lignes, une seule répétition de
quatre déclarations, aucune duplication à retirer. Le dépassement est le prix
exact de la migration, pas une dérive.

Un budget sert de fil de détente contre les régressions, pas de vœu pieux : ces
seuils laissent ~4 % de marge sur le mesuré, donc toute dérive réelle les fait
sauter. **Les relever de nouveau sans avoir d'abord cherché le gaspillage serait
manquer leur but.**

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

> ⚠️ `graphqlUrl` est toujours un chemin **relatif** (`/graphql`), jamais une
> URL absolue. Voir « Proxy de développement » ci-dessous : le frontend et
> l'API Gateway doivent être vus comme la **même origine** par le
> navigateur (le cookie `refresh_token` est `SameSite=Strict`).

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  graphqlUrl: '/graphql',
  appName: 'Facturation Eau',
};

// environments/environment.prod.ts
export const environment = {
  production: true,
  graphqlUrl: '/graphql',
  appName: 'Facturation Eau',
};
```

### Proxy de développement

`ng serve` (port 4200) et l'API Gateway (`localhost:8080`) sont deux
origines distinctes pour le navigateur. Pour que `/graphql` reste
same-origin en développement, le serveur de dev Angular proxyfie cette
route vers la Gateway via `proxy.conf.json` (racine du projet) :

```json
{
  "/graphql": {
    "target": "http://localhost:8080",
    "secure": false,
    "changeOrigin": true
  }
}
```

Câblé dans `angular.json` (`architect.serve.options.proxyConfig`). En
production, c'est nginx (devant la Gateway) qui joue ce rôle en servant le
build Angular et en proxyfiant `/graphql` sous le même domaine.
