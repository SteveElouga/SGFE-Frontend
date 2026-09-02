# 001 — Ajouter une transition de route (View Transitions API)

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: N/A (missed opportunity)
- **Category**: 8. Missed opportunities
- **Estimated scope**: 2 files, small

## Problem

Aucune transition n'est configurée sur le routeur Angular. Chaque navigation
(clic sidebar, carte KPI, lien "Voir" d'un tableau, bouton retour) remplace le
contenu de `<router-outlet>` **dans la même frame**, sans fondu ni glissement.
C'est le geste le plus répété de toute session utilisateur.

```ts
// src/app/app.config.ts:37 — actuel
provideRouter(routes),
```

```html
<!-- src/app/features/shell/shell.component.html:17 — actuel -->
<router-outlet />
```

`@angular/animations` est installé mais câblé uniquement pour les overlays
PrimeNG (`provideAnimationsAsync()`, voir commentaire à côté) — aucun
`trigger()`/`animations: []` custom n'existe dans le dépôt (0 résultat au
grep). La View Transitions API native du navigateur, exposée par Angular via
`withViewTransitions()`, est le bon outil : zéro dépendance, dégrade en
no-op sur un navigateur qui ne la supporte pas.

## Target

```ts
// target — app.config.ts
import { provideRouter, withViewTransitions } from '@angular/router';
// ...
provideRouter(routes, withViewTransitions()),
```

```scss
// target — src/styles/global.scss, nouvelle règle
// Le navigateur applique par défaut un cross-fade de 0.25s ease sur
// ::view-transition-old(root)/::view-transition-new(root). On aligne sur nos
// propres jetons plutôt que de garder le défaut du navigateur (Règle de
// Cohésion, AUDIT.md §7 : pas deux vocabulaires de mouvement qui coexistent).
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: var(--duree-moyenne, 220ms);
  animation-timing-function: var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

## Repo conventions to follow

- Jetons de durée/easing déjà définis dans `src/styles/_tokens.scss:234-238`
  (`--ease-out`, `--duree-moyenne: 220ms`) — les réutiliser, ne pas en créer
  de nouveaux.
- Le bloc `prefers-reduced-motion` global existe déjà à
  `src/styles/global.scss:143-152` (neutralise `animation-duration`/
  `transition-duration` à 0.01ms) — la règle explicite pour
  `::view-transition-*` est un filet en plus, car les pseudo-éléments de la
  View Transitions API ne sont pas garantis d'hériter de cette règle générale
  sur tous les moteurs.

## Steps

1. Dans `src/app/app.config.ts`, importer `withViewTransitions` depuis
   `@angular/router` et l'ajouter en second argument de `provideRouter(routes)`
   (ligne 37).
2. Dans `src/styles/global.scss`, ajouter le bloc `::view-transition-old(root)`/
   `::view-transition-new(root)` ci-dessus, à la suite de la section
   "Accessibilité : respect de prefers-reduced-motion" (après la ligne ~152).
3. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` ciblant
   `::view-transition-*` juste après.

## Boundaries

- Ne pas toucher à `shell.component.html` ni à la structure du routeur.
- Ne pas assigner de `view-transition-name` individuel à la sidebar/topbar
  pour l'instant (scope minimal — un cross-fade racine suffit, la sidebar et
  la bande navy sont visuellement identiques d'une navigation à l'autre sauf
  l'item actif en surbrillance, effet secondaire mineur accepté).
- Ne pas ajouter de dépendance.

## Verification

- **Mécanique** : `npm run verify:types` (OK) ; `ng build --configuration
  production` (OK, aucune erreur liée aux View Transitions, feature stable
  Angular 17+).
- **Feel check** : lancer l'app, naviguer Tableau de bord → Abonnés → une
  fiche abonné → retour. Confirmer :
  - Un fondu bref (~220ms) remplace le remplacement instantané précédent.
  - Aucun flash blanc ni superposition visible du contenu.
  - Sur un navigateur sans support (vérifier via DevTools → forcer
    l'absence de l'API, ou Firefox si la flag est désactivée) : navigation
    identique à avant, aucune erreur console.
  - Activer `prefers-reduced-motion` (panneau Rendering DevTools) : la
    navigation redevient instantanée, sans fondu.
- **Done when** : toute navigation top-level (changement de route) affiche un
  fondu de ~220ms au lieu d'un remplacement instantané, et ce fondu disparaît
  sous mouvement réduit.

## Note de vérification (post-implémentation)

Sur `ng serve` (Vite dev-server), chaque navigation logue une erreur console
`InvalidStateError: Transition was aborted because of invalid state`
(`@angular_router.js:3529`), reproduite à froid sur deux navigations distinctes
(chargement dur + clic sidebar réel). Isolé par A/B direct : le même code,
servi en build de production (`ng build --configuration production` +
serveur statique local, aucun proxy Vite) sur les mêmes routes/gardes, ne
produit **aucune** erreur — navigation et rendu corrects à chaque fois.
Conclusion : artefact propre au dev-server Vite (probablement un décalage de
micro-tâches introduit par son graphe de modules ESM face au callback de
committal du routeur), sans impact en production. Aucune action de code
requise ; à surveiller si une future version d'Angular/Vite change ce
comportement en dev.
