# 008 — Entrée animée du bandeau d'erreur

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: LOW
- **Category**: 8. Missed opportunities / 7. Cohesion
- **Estimated scope**: 1 file (scss), trivial

## Problem

`src/app/shared/components/error-banner/error-banner.component.scss` —
aucune transition. Composant utilisé via `@if (error()) { <app-error-banner
… /> }` brut sur ~10 écrans (`paiements-list.component.html:10-12`,
`abonne-detail.component.html:27-29,431-433`,
`abonne-form.component.html:24-26`, `facture-detail.component.html`,
`campagne-detail.component.html`, `configuration.component.html`,
`terrain.component.html:53`, etc.). Il apparaît en pleine largeur d'un coup
dès qu'une requête échoue — moment déjà stressant, aggravé par l'apparition
brutale. Contraste direct avec le toast (qui gère aussi des erreurs) et son
slide-in soigné.

```scss
/* error-banner.component.scss — actuel */
.error-banner {
  display: flex;
  align-items: center;
  gap: var(--pas-2);
  padding: var(--pas-3) var(--pas-4);
  background: var(--danger-fond);
  border: 1px solid var(--danger-trait);
  border-radius: var(--rayon-md);
  font-size: var(--texte-md);
  color: var(--danger-encre);
  /* aucune transition */
  /* … */
}
```

Le composant n'a pas de logique interne d'`@if` — c'est toujours l'appelant
qui le monte/démonte conditionnellement. Une règle sur `.error-banner`
suffit donc à couvrir tous les appelants d'un coup.

## Target

```scss
/* target */
.error-banner {
  display: flex;
  align-items: center;
  gap: var(--pas-2);
  padding: var(--pas-3) var(--pas-4);
  background: var(--danger-fond);
  border: 1px solid var(--danger-trait);
  border-radius: var(--rayon-md);
  font-size: var(--texte-md);
  color: var(--danger-encre);
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity var(--duree-courte, 160ms) var(--ease-out),
    transform var(--duree-courte, 160ms) var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(-6px);
  }

  /* … règles &__icon, &__message, &__retry inchangées … */
}

@media (prefers-reduced-motion: reduce) {
  .error-banner {
    transition: none;
  }
}
```

## Repo conventions to follow

- `--duree-courte` (160ms), `--ease-out` : `src/styles/_tokens.scss:234-238`.
- Même pattern `@starting-style` + `translateY(-6px)` que le plan 003
  (`.t-offline`) — cohérence entre les deux bannières d'état de l'app.

## Steps

1. Dans `error-banner.component.scss`, ajouter `opacity`, `transform`,
   `transition` et le bloc `@starting-style` à la règle `.error-banner`.
2. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` à la suite.

## Boundaries

- Ne pas toucher à `error-banner.component.html`.
- Ne pas toucher aux ~10 appelants listés ci-dessus — le fix est
  entièrement contenu dans le composant partagé.
- Ne pas animer `&__retry` séparément (le bouton suit déjà la règle
  globale de press-scale via `button`, `global.scss:87-99` — pas de
  double emploi).

## Verification

- **Mécanique** : `npm run verify:types` ; `ng test` (222 tests attendus) ;
  `ng build --configuration production`.
- **Feel check** : provoquer une erreur de chargement (couper le réseau
  puis recharger un écran comme `/paiements` ou `/campagnes/:id`).
  Confirmer :
  - Le bandeau rouge glisse légèrement depuis le haut en apparaissant.
  - `prefers-reduced-motion` activé : apparition instantanée.
- **Done when** : `.error-banner` porte la transition + `@starting-style`
  ci-dessus, vérifié sur au moins un des ~10 écrans appelants.
