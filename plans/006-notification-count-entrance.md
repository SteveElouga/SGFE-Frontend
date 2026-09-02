# 006 — Entrée animée du badge de compteur de notifications

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: MEDIUM
- **Category**: 7. Cohesion
- **Estimated scope**: 1 file (scss), trivial

## Problem

`src/app/shared/components/notification-bell/notification-bell.component.html:14-16` :

```html
<!-- actuel -->
@if (unreadCount() > 0) {
  <span class="nb__count">{{ unreadCount() }}</span>
}
```

```scss
/* notification-bell.component.scss:29-42 — .nb__count actuel, aucune transition */
.nb__count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--pas-1);
  background: var(--danger);
  border: 2px solid var(--surface);
  border-radius: var(--rayon-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--texte-xs);
  font-weight: 700;
  color: var(--surface);
}
```

Ce badge apparaît/disparaît via `@if` (montage/démontage DOM, pas juste un
changement de style). Le panneau juste en dessous (`.nb__panel`, même
fichier lignes 55-100) a un scale+fade ancré à la cloche, commenté
explicitement ("rien dans le monde réel n'apparaît à partir de rien") — le
petit badge numérique juste à côté n'a reçu aucun soin équivalent.

## Target

```scss
/* target — .nb__count, propriétés ajoutées */
.nb__count {
  /* … propriétés existantes inchangées … */
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 160ms var(--ease-out),
    transform 160ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: scale(0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nb__count {
    transition: none;
  }
}
```

`scale(0.6)` de départ (pas `scale(0)`, AUDIT.md §3) et 160ms
`var(--duree-courte)` — bucket "tooltips/petits éléments" (125-200ms,
AUDIT.md §2). Ne couvre que l'apparition (0 → N) : un changement de valeur
pendant que le badge reste monté (2 → 3) ne remonte pas le DOM et ne
redéclenche donc pas `@starting-style` — c'est le comportement voulu, un
badge qui "pop" à chaque incrément serait une distraction sur un élément vu
en permanence dans la topbar.

## Repo conventions to follow

- `--ease-out`, `--duree-courte` (160ms) : `src/styles/_tokens.scss:234-238`.
- Exemplar de la même famille de geste dans le même fichier :
  `.nb__panel` (lignes 55-100), scale de départ 0.96, commentaire explicite
  sur le "jamais depuis zéro" — même logique appliquée ici à un plus petit
  élément (0.6 plutôt que 0.96, car un badge de 18px a besoin d'un
  dépassement de départ plus marqué pour que le "pop" se voie à cette
  échelle — une différence de 4% comme sur le panneau serait imperceptible
  sur 18px).

## Steps

1. Dans `notification-bell.component.scss`, règle `.nb__count` (ligne ~29),
   ajouter `opacity`, `transform`, `transition` et le bloc
   `@starting-style` ci-dessus.
2. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` à la suite.

## Boundaries

- Ne pas toucher au template ni à la logique de `unreadCount()`.
- Ne pas animer la disparition (passage à "Tout marquer comme lu") — hors
  scope de ce plan, un `@if` Angular ne peut pas animer sa propre
  disparition sans callback JS ; laisser la disparition instantanée est
  acceptable (comportement standard des badges de notification natifs).
- Ne pas toucher à `.nb__panel` ni `.nb__bell` — déjà conformes.

## Verification

- **Mécanique** : `npm run verify:types` ; `ng build --configuration
  production`.
- **Feel check** : provoquer l'apparition du badge (une notification non
  lue existante au chargement, ou déclencher un envoi qui en crée une).
  Confirmer :
  - Le badge rouge "pop" légèrement en apparaissant, au lieu de surgir
    net.
  - `prefers-reduced-motion` activé : apparition instantanée.
- **Done when** : `.nb__count` a la transition + `@starting-style`
  ci-dessus ; le comportement de disparition reste inchangé (hors scope).
