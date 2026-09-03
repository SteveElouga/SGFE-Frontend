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
UI               PrimeNG 21 (+ préréglage maison `core/theme/aquabill-preset.ts`)
Icons            PrimeIcons
Données          Apollo Client — tout passe par GraphQL, pas de httpResource
State            Signals (Angular 22 stable — PAS de NgRx)
Forms            FormsModule + `ngModel`, validation par `computed()`
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
│   │   │   │   ├── data-table/          # tableau trié + paginé, 6 écrans
│   │   │   │   ├── bottom-sheet/        # coquille des feuilles modales
│   │   │   │   ├── badge/               # référence unique du badge de statut
│   │   │   │   ├── paiement-form/       # saisie d'un versement
│   │   │   │   └── …                    # ~28 composants, voir le dossier
│   │   │   ├── pipes/
│   │   │   │   ├── fcfa.pipe.ts         # Formatage montants FCFA
│   │   │   │   └── pluriel.pipe.ts      # Accord singulier/pluriel/zéro
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

### Formulaires — `ngModel` et validation par signal

> ⚠️ **Corrigé le 28 août 2026.** Cette section prescrivait les *Signal Forms*
> comme obligatoires et interdisait `ReactiveFormsModule`. Mesure faite :
> **0 occurrence** de `signalForm` dans le dépôt, contre **54** de
> `FormsModule`. La prescription n'a jamais été suivie ; c'est elle qui était
> fausse, pas le code. Elle décrivait une cible, pas un état.

Le motif réel : `ngModel` en écriture, un `signal()` par champ, et la
validation dérivée en `computed()`. Voir `shared/components/paiement-form/`
pour l'exemple de référence.

```typescript
readonly pMontant = signal('');

readonly formValid = computed(() => {
  const montant = Number.parseFloat(this.pMontant());
  return !Number.isNaN(montant) && montant > 0;
});
```

<details>
<summary>Ancienne prescription (non appliquée, conservée pour mémoire)</summary>


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

</details>

### Composants — sélecteur `app-*`, standalone, OnPush

> ⚠️ **Corrigé le 28 août 2026.** Cette section prescrivait les composants
> *selectorless*. Mesure faite : **59 composants** déclarent un
> `selector: 'app-…'`, **aucun** n'est selectorless. La convention réelle est
> le sélecteur explicite — elle est cohérente, et c'est la prescription qui
> s'en écartait.

```typescript
@Component({
  selector: 'app-paiement-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

<details>
<summary>Ancienne prescription (non appliquée, conservée pour mémoire)</summary>


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

</details>

### Données — Apollo, jamais `httpResource`

> ⚠️ **Corrigé le 28 août 2026.** Cette section prescrivait `httpResource`.
> Mesure faite : **0 occurrence**, contre **84** appels
> `apollo.query/mutate/watchQuery`. C'est cohérent avec la règle fondamentale
> ci-dessus — ce frontend ne parle qu'à la gateway GraphQL, et `httpResource`
> vise des API REST qui n'existent pas ici. La prescription se contredisait
> elle-même.

<details>
<summary>Ancienne prescription (non appliquée, conservée pour mémoire)</summary>


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

</details>

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

### Types générés — la requête est la source de vérité

`src/app/graphql/generated.ts` est produit par `npm run codegen` depuis
l'instantané d'introspection déjà versionné (`schema-introspection.json`, celui
que `schema-contrat.spec.ts` valide). `npm run verify:codegen` échoue s'il a
vieilli. **Ne jamais le modifier à la main.**

Un type généré décrit ce que la requête **demande**, pas ce que le schéma
pourrait rendre. C'est toute la différence, et c'est celle qui manquait :

```ts
// ❌ le modèle écrit à la main — tout ce que le serveur POURRAIT rendre
export interface Facture { motifAnnulation?: string; /* … */ }

// ✅ la vue — ce que CETTE requête rapporte
export type FactureDetail = GetFactureQuery['facture'];
```

Avec l'interface, `@if (f.motifAnnulation)` compilait et valait `undefined` pour
toujours : le champ existait dans le type, `GET_FACTURE` ne le demandait pas, et
le bandeau d'annulation n'a jamais pu s'afficher. Cinq fonctionnalités vivaient
ainsi. Avec la vue, le champ n'existe pas et le gabarit ne compile plus.

**Les trois règles qui en découlent :**

1. **Un écran type ses signaux avec une vue de `graphql/vues.ts`**, jamais avec
   un modèle de `shared/models/`. Les modèles gardent les types de domaine
   (`StatutFacture`, les entrées de mutation, les fonctions de teinte) — pas la
   forme des données reçues.
2. **Deux documents qui alimentent le même écran partagent un fragment**
   (`graphql/fragments.ts`). Sans lui, l'un appauvrit ce que l'autre remplit :
   `ABONNE_UPDATED_SUB` écrivait dans le cache de la liste une sélection amputée
   de `numeroAbonne`, qui disparaissait donc de la ligne à la première mise à
   jour temps réel.
3. **Un composant partagé déclare ce qu'il lit**, pas la vue d'un de ses
   appelants (`FactureCible`, `AbonneCible`). Sinon il devient inutilisable
   depuis son second écran.

Et un piège du contrat lui-même : la gateway type `statut`, `modePaiement` et
`nature` en `String`, pas en énumération. Les unions du domaine restent utiles
là où c'est **l'application** qui choisit la valeur ; sur une valeur **reçue**,
la signature dit `string`, et une valeur inconnue prend la teinte neutre plutôt
que d'emprunter l'apparence d'un état voisin.

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
ng serve            # port 4200 (défaut Angular, voir proxy.conf.json)

# Build production PWA
ng build --configuration production

# Tests avec Vitest (défaut Angular 22)
ng test
ng test --coverage

# Vérifier les types TypeScript
npm run verify:types      # tsc -b --noEmit

# Régénérer les types GraphQL, et vérifier qu'ils sont à jour
npm run codegen
npm run verify:codegen
```

> ⚠️ **Corrigé le 1er septembre 2026.** Cette section indiquait `npx tsc
> --noEmit`, qui **ne vérifie rien** dans ce dépôt : `tsconfig.json` est un
> fichier-solution (`"files": []` plus des références vers `tsconfig.app.json`
> et `tsconfig.spec.json`). Sans `-b`, `tsc` construit un programme vide —
> mesuré : **0 fichier** de `src/app` contre **179** avec `-b`. La commande était
> verte en permanence, y compris sur du code qui ne compilait pas ; c'est
> `ng build` qui a tenu ce rôle en pratique, et lui seul vérifie les gabarits.

---

## Budgets de build — seuils mesurés, pas hérités

`angular.json` porte deux budgets. Ce ne sont **pas** les valeurs par défaut de
la CLI : elles ont été recalibrées le 27 août 2026 sur des mesures réelles,
après avoir cherché le gaspillage plutôt que de déplacer le seuil.

| Budget | Alerte | Erreur | Mesuré ce jour-là |
|---|---|---|---|
| `initial` | 680 kB | 800 kB | **652,68 kB** (165,14 kB transférés) |
| `anyComponentStyle` | 22 kB | 26 kB | **21,11 kB** (`campagne-detail`, 1er septembre 2026) |

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

**Pourquoi 22 et non 21, le 1er septembre 2026.** `.zone-table` (répartition par
zone, 5 colonnes + piste de progression 220px) n'avait pas de repli mobile :
sous 1024px elle restait un tableau en `overflow-x: auto`, scrollbar masquée —
l'anti-pattern exact qu'interdit la Règle du 320 (DESIGN.md), alors que
`.releves-table` juste au-dessus bascule déjà en cartes empilées depuis
longtemps. Ajout de `.zone-mobile`/`.zm-card`, même idiome que `.rm-card`. Le
gaspillage a été cherché avant de toucher au seuil : fusion de `.zone-mobile`
avec les propriétés déjà déclarées sur `.zone-table-wrap`, fusion de
`&__head`/`&__foot`, et le sélecteur `.muted` (dupliqué avec
`.agent-card__prog-num .muted`) remonté en règle unique — 21,34 → 21,11 kB.
Le reste est le prix exact d'un vrai repli mobile, pas une dérive : 20,10 →
21,11 kB.

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

`ng serve` (port 4200 en local) et l'API Gateway (derrière le nginx du
dépôt backend) sont deux origines distinctes pour le navigateur. Pour que
`/graphql` reste same-origin en développement, le serveur de dev Angular
proxyfie cette route vers ce nginx via `proxy.conf.json` (racine du projet) :

```json
{
  "/graphql": {
    "target": "https://localhost:8443",
    "secure": false,
    "changeOrigin": true,
    "ws": true
  }
}
```

Câblé dans `angular.json` (`architect.serve.options.proxyConfig`). En
production, c'est nginx (devant la Gateway) qui joue ce rôle en servant le
build Angular et en proxyfiant `/graphql` sous le même domaine.

> ⚠️ **Corrigé le 3 septembre 2026.** Le nginx du dépôt backend
> (`fix/hardening-infra-secrets`, PR #169 puis durcissement TLS de PR #173)
> redirige désormais **tout** le trafic `:80` (`8080` publié) vers `:443`
> (`8443` publié) — `location / { return 301 https://$host$request_uri; }`
> dans `nginx/default.conf`. Un proxy pointant encore vers
> `http://localhost:8080` reçoit cette redirection 301 telle quelle (le
> serveur de dev Angular ne la suit pas), donc `/graphql` échoue purement et
> simplement. Cible désormais `https://localhost:8443` avec `secure: false`
> (le certificat de dev est auto-signé, voir juste en dessous) — et cette
> section prescrivait `http://localhost:8080` sans jamais avoir été mise à
> jour après le durcissement TLS ; c'est elle qui avait tort, pas nginx.
>
> Prérequis local qui n'existait pas avant ce durcissement : générer le
> certificat auto-signé une fois avant le premier `docker compose up` du
> backend — `./scripts/generate-nginx-cert.sh` (dépôt backend, écrit dans
> `nginx/certs/`, gitignoré). Sans lui, nginx refuse de démarrer (fail-fast
> volontaire, même pattern que les clés JWT RS256 de `auth-service`).
