# 007 — Fondu du squelette vers le contenu réel dans data-table

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: MEDIUM
- **Category**: 8. Missed opportunities / 1. Purpose & frequency
- **Estimated scope**: 2 fichiers (html + scss), petit

## Problem

`src/app/shared/components/data-table/data-table.component.html:1-51` :

```html
<!-- actuel, extrait -->
@if (loading()) {
  <div class="dt" [class.dt--has-cards]="!!cardTemplate()" aria-hidden="true">
    <!-- squelette : mêmes en-têtes, lignes app-skeleton -->
  </div>
} @else {
  <div class="dt" [class.dt--has-cards]="!!cardTemplate()">
    <!-- contenu réel -->
  </div>
}
```

Le squelette épouse déjà la forme réelle (mêmes en-têtes/colonnes) pour
éviter un sursaut de mise en page — bonne pratique déjà en place. Mais le
remplacement lui-même reste un switch Angular instantané : le contenu réel
apparaît d'un bloc, sans transition. Ce composant est utilisé par ~10 écrans
de liste (abonnés, factures, paiements, impayés, utilisateurs, campagnes,
envois, rapports…) — impact large, occurrence individuelle discrète.

Les deux branches utilisent la **même classe** `.dt` sur leur conteneur
racine — impossible de cibler seulement le contenu réel en CSS sans les
distinguer d'abord.

## Target

```html
<!-- target — branche @if (loading()), ligne 6 -->
<div class="dt dt--squelette" [class.dt--has-cards]="!!cardTemplate()" aria-hidden="true">
```

```html
<!-- target — branche @else, ligne ~49, inchangée (pas de nouvelle classe ici) -->
<div class="dt" [class.dt--has-cards]="!!cardTemplate()">
```

```scss
/* target — data-table.component.scss, à la suite de la règle .dt existante (ligne ~183) */
.dt:not(.dt--squelette) {
  opacity: 1;
  transition: opacity var(--duree-moyenne, 220ms) var(--ease-out);

  @starting-style {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dt:not(.dt--squelette) {
    transition: none;
  }
}
```

Seul le contenu réel (`.dt` sans le modificateur `--squelette`) reçoit
l'entrée en fondu ; le squelette lui-même n'est pas concerné (son propre
montage initial n'a pas besoin de ce traitement, il est déjà géré par
`app-skeleton`).

## Repo conventions to follow

- `--duree-moyenne` (220ms), `--ease-out` : `src/styles/_tokens.scss:234-238`
  — bucket "dropdowns/selects" (150-250ms, AUDIT.md §2) est le bon calibre
  pour un remplacement de contenu de cette taille.
- Pas de stagger par ligne (`@for (r of pagedRows())`) : ces tableaux
  affichent 10 à plusieurs dizaines de lignes par page — un stagger de
  30-80ms par ligne sur 30 lignes ajouterait ~2.4s de délai perçu avant que
  la dernière ligne soit lisible, contraire à AUDIT.md §7 ("le stagger ne
  doit jamais bloquer l'interaction"). Un seul fondu global du conteneur est
  le bon compromis.
- `.dt` existant (ligne 183) garde toutes ses propriétés actuelles
  inchangées ; on ajoute une règle séparée `.dt:not(.dt--squelette)`
  plutôt que de modifier `.dt` directement, pour ne pas affecter le
  squelette.

## Steps

1. Dans `data-table.component.html`, ligne 6 (ouverture de la branche
   `@if (loading())`), ajouter la classe `dt--squelette` au `<div class="dt"
   …>`.
2. Dans `data-table.component.scss`, après la règle `.dt` (ligne ~183),
   ajouter la règle `.dt:not(.dt--squelette)` avec `opacity`/`transition`/
   `@starting-style` ci-dessus.
3. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` à la suite.

## Boundaries

- Ne pas toucher à la branche `@else` du template (aucune classe à y
  ajouter — l'absence de `dt--squelette` suffit à la cibler via
  `:not()`).
- Ne pas ajouter de stagger par ligne (voir "Repo conventions" ci-dessus).
- Ne pas toucher à `.dt--has-cards` ni à la logique de bascule
  table/cartes mobile (`[appCardRow]`).

## Verification

- **Mécanique** : `npm run verify:types` ; `ng test` (222 tests attendus) ;
  `ng build --configuration production`.
- **Feel check** : ouvrir un écran de liste avec un throttling réseau
  "Slow 3G" (DevTools) pour voir le squelette assez longtemps, ex.
  `/abonnes` ou `/factures`. Confirmer :
  - Le contenu réel apparaît en fondu doux au lieu de remplacer le
    squelette d'un coup.
  - Aucun sursaut de mise en page pendant le fondu (le squelette et le
    contenu partagent déjà la même forme).
  - `prefers-reduced-motion` activé : remplacement instantané.
- **Done when** : la branche `@else` de `data-table` porte
  `dt--squelette`-exempte + la transition ci-dessus, sur au moins un écran
  de liste vérifié en direct.
