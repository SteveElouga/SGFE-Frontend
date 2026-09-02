# 003 — Animer l'entrée des bannières hors-ligne / sync terrain

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: N/A (missed opportunity)
- **Category**: 8. Missed opportunities
- **Estimated scope**: 1 file (scss), small

## Problem

`src/app/features/terrain/terrain.component.html:42-50` (`.t-offline`,
`@if (!offline.online())`) et lignes 55-69 (`.sync-card`,
`@if (offline.pendingCount() > 0)`) : deux bannières pleine largeur qui
apparaissent/disparaissent en haut de la liste terrain sans transition.
Le réseau instable en tournée est une condition **régulière** du métier
(CLAUDE.md : "Réseau : souvent instable sur le terrain"), pas un cas rare.

```scss
/* terrain.component.scss:244-263 — .t-offline actuel, aucune transition */
.t-offline {
  background: var(--ambre-attente);
  padding: var(--pas-2) var(--pas-4);
  display: flex;
  align-items: center;
  gap: var(--pas-2);
  color: var(--surface);
  /* … */
}
```

```scss
/* terrain.component.scss:274-282 — .sync-card actuel, aucune transition */
.sync-card {
  margin: var(--pas-3) var(--pas-4) 0;
  background: var(--attente-fond);
  border: 1.5px solid var(--attente-trait);
  border-radius: var(--rayon-lg);
  padding: var(--pas-3) var(--pas-4);
  display: flex;
  align-items: center;
  gap: var(--pas-3);
  /* … */
}
```

## Target

```scss
/* target — .t-offline, même bloc, propriétés ajoutées */
.t-offline {
  /* … propriétés existantes inchangées … */
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity var(--duree-courte, 160ms) var(--ease-out),
    transform var(--duree-courte, 160ms) var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(-8px);
  }
}
```

```scss
/* target — .sync-card, même bloc, propriétés ajoutées */
.sync-card {
  /* … propriétés existantes inchangées … */
  opacity: 1;
  transform: translateY(0) scale(1);
  transition:
    opacity var(--duree-courte, 160ms) var(--ease-out),
    transform var(--duree-courte, 160ms) var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
}
```

```scss
/* target — filet reduced-motion, à la suite des deux règles */
@media (prefers-reduced-motion: reduce) {
  .t-offline,
  .sync-card {
    transition: none;
  }
}
```

## Repo conventions to follow

- `--duree-courte` (160ms), `--ease-out` : `src/styles/_tokens.scss:234-238`
  — bucket "tooltips/petits popovers" (125-200ms, AUDIT.md §2) est le bon
  calibre pour une bannière d'état, pas les 220-300ms des cartes plus
  lourdes (sheet, dialog).
- `@starting-style` déjà retenu pour ce type d'élément dans les plans 002 et
  006 de ce même lot — même pattern, cohérence à travers les 3 plans.
- `.t-offline` reste à `scale(1)` (translation seule) car c'est une bande
  pleine largeur sans coins — une mise à l'échelle n'aurait pas de sens
  visuel ; `.sync-card` a un `border-radius` et flotte dans la liste, un
  `scale(0.97)` discret (jamais `scale(0)`, AUDIT.md §3) est donc pertinent
  pour elle et pas pour `.t-offline`.

## Steps

1. Dans `terrain.component.scss`, règle `.t-offline` (ligne ~244), ajouter
   `opacity`/`transform`/`transition` et le `@starting-style` ci-dessus.
2. Dans la règle `.sync-card` (ligne ~274), ajouter les mêmes propriétés
   avec le `scale(0.97)` supplémentaire.
3. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` ci-dessus.

## Boundaries

- Ne pas toucher au template.
- Ne pas ajouter d'animation de sortie distincte (l'entrée suffit ; la
  sortie reste instantanée, comme pour le plan 006 — cohérent avec
  l'absence d'API `:leave` dans ce dépôt).
- Ne pas fusionner ces deux règles en une classe partagée — elles ont des
  valeurs de `transform` différentes (voir "Repo conventions" ci-dessus),
  une classe commune masquerait cette différence intentionnelle.

## Verification

- **Mécanique** : `npm run verify:types` ; `ng build --configuration
  production`.
- **Feel check** : sur `/terrain`, couper le réseau (DevTools → Network →
  Offline) puis le rétablir. Confirmer :
  - La bannière ambre glisse légèrement depuis le haut en apparaissant, au
    lieu de claquer dans la mise en page.
  - Simuler une saisie hors-ligne (au moins une entrée en attente) : la
    carte de synchronisation apparaît avec un léger fondu + zoom-in
    (jamais depuis `scale(0)`).
  - `prefers-reduced-motion` activé : les deux bannières apparaissent
    instantanément.
- **Done when** : les deux bannières terrain ont une entrée visible et
  cohérente entre elles (même durée, même easing), sans mouvement sous
  `prefers-reduced-motion`.
