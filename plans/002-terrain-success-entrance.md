# 002 — Animer l'entrée de l'écran de succès terrain

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: N/A (missed opportunity)
- **Category**: 8. Missed opportunities
- **Estimated scope**: 1 file (scss), small

## Problem

`src/app/features/terrain/terrain.component.html:233-246` — le passage
`@switch(view())` de `'saisie'` à `'success'` est un `@case` Angular brut :
coupure instantanée, sans le moindre geste sur le bloc `.succ-head` qui
matérialise la confirmation ("La Règle du Vert Rare" du DESIGN.md : le vert
profond n'apparaît que quand un relevé est pris — ce bloc EST ce moment).

```scss
/* src/app/features/terrain/terrain.component.scss:766-815 — actuel, extrait */
.succ-head {
  background: linear-gradient(160deg, var(--vert-profond), var(--vert-abysse));
  padding: var(--pas-3) var(--pas-5);
  display: flex;
  align-items: center;
  gap: var(--pas-3);
  min-height: 48px;
  /* aucune propriété transition/animation dans tout le bloc */

  &__check {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-inverse-fort);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  /* … */
}
```

Chaque `@case('success')` est un vrai (re)montage DOM — un agent revoit cet
écran des dizaines de fois par tournée (flux "3 taps max", CLAUDE.md), donc
chaque occurrence est une fenêtre d'opportunité neuve, pas une seule fois au
premier chargement.

## Target

```scss
/* target — terrain.component.scss, dans le bloc .succ-head */
.succ-head {
  /* … propriétés existantes inchangées … */
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity var(--duree-moyenne, 220ms) var(--ease-out),
    transform var(--duree-moyenne, 220ms) var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(-6px);
  }

  &__check {
    /* … propriétés existantes inchangées … */
    transform: scale(1);
    opacity: 1;
    transition:
      transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1) 70ms,
      opacity 160ms var(--ease-out) 70ms;

    @starting-style {
      transform: scale(0.6);
      opacity: 0;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .succ-head,
  .succ-head__check {
    transition: none;
  }
}
```

Le check reçoit un décalage de 70ms (dans la fourchette de stagger 30-80ms,
AUDIT.md §7) : la carte arrive, puis le check confirme — pas les deux d'un
bloc. Sa courbe `cubic-bezier(0.34, 1.56, 0.64, 1)` est un "back-out" avec
léger dépassement, l'équivalent CSS d'un ressort discret (bounce ~0.2,
AUDIT.md §4) — approprié ici car c'est justement le moment de délice que la
Règle du Vert Rare réserve.

## Repo conventions to follow

- `--duree-moyenne`, `--ease-out` : `src/styles/_tokens.scss:234-238`.
- `@starting-style` est déjà le bon outil pour un élément monté par un
  `@if`/`@case` Angular sans callback JS (pas d'équivalent `:leave` utilisé
  ailleurs dans ce dépôt — cohérent avec l'absence totale de
  `trigger()`/`animations: []`, confirmée par grep).
- Exemplar de courbe "pop" avec dépassement : aucun dans ce dépôt à ce jour
  (première utilisation) — rester sur la valeur AUDIT.md ci-dessus, ne pas
  en inventer une autre.

## Steps

1. Dans `terrain.component.scss`, dans la règle `.succ-head` (ligne ~766),
   ajouter `opacity: 1; transform: translateY(0); transition: ...` et le bloc
   `@starting-style` ci-dessus.
2. Dans la même règle, sous-sélecteur `&__check` (ligne ~774), ajouter
   `transform: scale(1); opacity: 1; transition: ...` et son
   `@starting-style`.
3. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` ci-dessus juste
   après la fermeture de `.succ-head`.

## Boundaries

- Ne pas toucher au template (`terrain.component.html`) — uniquement le SCSS.
- Ne pas animer `.succ-head__counter`/`.succ-head__title`/`.succ-head__sub` —
  ils font partie du même bloc et suivent son fondu ; les animer séparément
  ajouterait un stagger inutile sur du texte.
- Ne pas dépasser 260ms au total (budget "modals/drawers" 200-500ms n'est
  pas le bon calibre ici — cette carte est plus proche d'un toast/tooltip
  vu la fréquence).

## Verification

- **Mécanique** : `npm run verify:types` ; `ng build --configuration
  production`.
- **Feel check** : sur `/terrain`, saisir un index et valider pour atteindre
  l'écran de succès. Confirmer :
  - La carte verte glisse légèrement vers le bas en apparaissant (pas un
    simple fondu plat).
  - Le check blanc "pop" avec un très léger dépassement, perceptiblement
    après la carte (pas simultané).
  - Répéter sur 2-3 relevés consécutifs : l'animation rejoue à l'identique
    à chaque fois (pas seulement au premier montage du composant).
  - DevTools Animations panel à 10% de vitesse : le check dépasse
    légèrement sa taille finale puis se stabilise (confirmation visuelle du
    cubic-bezier à overshoot).
  - `prefers-reduced-motion` activé : la carte et le check apparaissent
    instantanément, sans mouvement.
- **Done when** : l'écran de succès terrain ne "claque" plus à l'écran ; la
  carte glisse et le check pop avec un léger décalage, sous mouvement normal
  uniquement.
