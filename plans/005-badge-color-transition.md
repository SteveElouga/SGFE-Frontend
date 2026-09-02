# 005 — Transition de couleur sur le changement de statut du badge

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: MEDIUM
- **Category**: 7. Cohesion / 8. Missed opportunities
- **Estimated scope**: 1 file (scss), trivial

## Problem

`src/app/shared/components/badge/badge.component.scss` (fichier entier) —
aucune propriété `transition`. Le composant est utilisé ainsi :

```ts
// badge.component.ts:22 — actuel
template: `<span class="badge badge--{{ tone() }} badge--{{ size() }}">{{ label() }}</span>`,
```

Quand `tone()` change (ex. une mutation d'encaissement fait passer une
facture de PARTIELLE à PAYÉE, `facture-detail.component.html:31,40,72`),
Angular réécrit la chaîne de classes sur le **même élément** `<span>` — donc
une transition CSS déclarée sur `.badge` s'appliquerait correctement (pas
besoin de `@starting-style`, ce n'est pas un montage/démontage). Le badge
change de famille de couleur en direct, sans transition, sur un écran qui
gère de l'argent réel — trois instances du badge sur cet écran (héro
mobile, header, carte) basculent toutes instantanément.

```scss
/* badge.component.scss — actuel */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--badge-rayon);
  border: 1px solid transparent;
  font-weight: var(--badge-poids);
  letter-spacing: var(--badge-espace);
  text-transform: var(--badge-casse);
  white-space: nowrap;
  /* aucune transition */
}
```

## Target

```scss
/* target */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--badge-rayon);
  border: 1px solid transparent;
  font-weight: var(--badge-poids);
  letter-spacing: var(--badge-espace);
  text-transform: var(--badge-casse);
  white-space: nowrap;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .badge {
    transition: none;
  }
}
```

`ease` (pas `ease-out`) est la courbe correcte ici : AUDIT.md §2 dit
explicitement "Hover / color change → `ease`" — ce n'est ni une entrée ni un
déplacement à l'écran, c'est un changement de teinte sur place.
`background-color`/`border-color`/`color` sont des propriétés peinture
seule (pas de layout ni de composite), donc conformes à la règle
performance §5 malgré l'absence de la liste explicite `transform`/`opacity`
— cette règle cible spécifiquement les propriétés qui déclenchent layout
(`width`, `height`, `top`, `left`…), pas les propriétés de couleur.

## Repo conventions to follow

- Le composant est la référence unique du badge de statut dans toute
  l'app (commentaire en tête du fichier) — un seul point de modification
  suffit à corriger les ~15+ usages recensés dans le dépôt.
- Pas de jeton de durée `200ms` existant dans `_tokens.scss` (`--duree-courte`
  160ms, `--duree-moyenne` 220ms) — utiliser `200ms` en dur ici est
  acceptable pour une transition de couleur ponctuelle (AUDIT.md ne
  prescrit pas de jeton dédié aux changements de couleur), mais si un
  exécutant préfère la cohérence stricte des jetons, `var(--duree-courte,
  160ms)` est un remplacement acceptable — ne pas introduire de nouveau
  jeton pour ce seul cas.

## Steps

1. Dans `badge.component.scss`, ajouter la propriété `transition` ci-dessus
   à la règle `.badge`.
2. Ajouter le bloc `@media (prefers-reduced-motion: reduce)` à la suite.

## Boundaries

- Ne pas toucher aux modificateurs `&--success`/`&--info`/etc. — seule la
  règle de base `.badge` change.
- Ne pas toucher à `badge.component.ts` ni à aucun appelant.
- Ne pas animer `border-radius`/`padding`/taille — ces valeurs ne changent
  jamais entre les variantes de teinte, aucune raison de les inclure.

## Verification

- **Mécanique** : `npm run verify:types` ; `ng test` (222 tests attendus,
  aucune régression — le composant n'a pas de test dédié sur les styles) ;
  `ng build --configuration production`.
- **Feel check** : sur une fiche facture (`/factures/:id`), enregistrer un
  paiement qui fait passer le statut de PARTIELLE à PAYÉE (ou utiliser la
  correction manuelle de statut, écran de détail facture). Confirmer :
  - Le badge transitionne en douceur (fond ambre → fond mint) plutôt que
    de sauter.
  - Les trois occurrences du badge sur l'écran (héro, header, carte) qui
    partagent la même donnée basculent chacune indépendamment mais avec la
    même durée perçue.
  - `prefers-reduced-motion` activé : le changement redevient instantané.
- **Done when** : `.badge` porte la transition ci-dessus et tout changement
  de `tone()` sur un badge déjà monté s'anime.
