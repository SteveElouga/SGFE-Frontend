# 004 — Aligner le press-scale des cartes dashboard sur la règle universelle

- **Status**: DONE
- **Commit**: 653168e
- **Severity**: HIGH
- **Category**: 3. Physicality & origin / 7. Cohesion
- **Estimated scope**: 1 file (scss), small

## Problem

`src/app/features/dashboard/dashboard/dashboard.component.scss:296-320`
(`.dash-kpi`) et lignes ~811-830 (`.dash-camp`) : ces cartes sont des
`<a routerLink>` nues, donc hors de la règle globale de press-scale
(`global.scss:87-99`, qui ne cible que `button`, `[role='button']`, `.btn`,
`a.page-topbar-action`).

```scss
/* dashboard.component.scss:296-320 — .dash-kpi actuel */
.dash-kpi {
  /* … */
  transition:
    transform 160ms var(--ease-out, ease-out),
    border-color 0.15s,
    box-shadow 0.15s;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: translateY(-1px);
      box-shadow: var(--ombre-portee);
    }
  }
  &:active {
    transform: translateY(0); /* annule le lift, ne comprime rien */
  }
  /* … */
}
```

```scss
/* dashboard.component.scss:~811-830 — .dash-camp actuel */
.dash-camp {
  /* … */
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 160ms var(--ease-out, ease-out);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--surface);
      border-color: var(--filet-pale);
      transform: translateY(-1px);
    }
  }
  /* aucun état :active */
  /* … */
}
```

Ce sont les éléments les plus tapés du dashboard admin/comptable (3 tuiles
KPI + grille de cartes de campagnes, consultés plusieurs fois par jour). Le
geste correct existe déjà **dans le même fichier** :

```scss
/* dashboard.component.scss:1176-1192 — .dash-vide__cta, exemplar correct */
&__cta {
  /* … */
  transition: transform var(--duree-courte) var(--ease-out);

  &:active {
    transform: scale(0.97);
  }
}
```

## Target

```scss
/* target — .dash-kpi, remplace le bloc &:active existant */
&:active {
  transform: scale(0.97);
}
```

```scss
/* target — .dash-camp, ajoute un bloc &:active (absent aujourd'hui) */
&:active {
  transform: scale(0.97);
}
```

Sur `.dash-kpi`, le hover (`translateY(-1px)`) et l'active (`scale(0.97)`)
se combinent naturellement via `transform` : au clic, le navigateur applique
le dernier état matché (`:active` gagne sur `:hover` dans l'ordre de
cascade CSS pour un même élément à un instant donné) — pas de conflit à
résoudre, `transform: scale(0.97)` remplace simplement
`transform: translateY(0)`.

## Repo conventions to follow

- Exemplar exact à copier : `.dash-vide__cta` ci-dessus, même fichier.
- `scale(0.97)` est LA valeur DESIGN.md pour le press-scale (jamais 0.95 ou
  0.98 sans raison — rester sur 0.97 partout, cohérence globale déjà
  observée dans `global.scss:98` et `.dash-vide__cta`).

## Steps

1. Dans `dashboard.component.scss`, règle `.dash-kpi` (ligne ~317-319),
   remplacer `&:active { transform: translateY(0); }` par
   `&:active { transform: scale(0.97); }`.
2. Dans la règle `.dash-camp` (après le bloc `@media (hover: hover)…`, ligne
   ~826), ajouter `&:active { transform: scale(0.97); }` (bloc absent
   aujourd'hui).

## Boundaries

- Ne pas toucher aux transitions déjà déclarées (`transition: transform
  160ms var(--ease-out, ease-out), …` reste identique — seule la valeur de
  `transform` sous `:active` change/s'ajoute).
- Ne pas toucher au HTML (`dashboard.component.html`) — ces éléments sont
  déjà des `<a>`, pas de changement de rôle ARIA nécessaire.
- Le filet `prefers-reduced-motion` global (`global.scss:103-110`) neutralise
  déjà `:active { transform: none; }` pour `button`/`.btn`/etc. — ces deux
  classes n'y sont pas listées ; voir Step 3 implicite : pas besoin d'ajout
  séparé ici, la règle générale à la ligne 143 (`* { transition-duration:
  0.01ms !important }`) rend le scale imperceptible de toute façon sous
  mouvement réduit (durée quasi nulle), donc pas de finding accessibilité
  distinct à corriger dans ce plan.

## Verification

- **Mécanique** : `npm run verify:types` ; `ng build --configuration
  production`.
- **Feel check** : sur `/dashboard` (rôle ADMIN ou COMPTABLE), taper (ou
  cliquer-maintenir) une tuile KPI et une carte de campagne. Confirmer :
  - Les deux cartes se compriment légèrement (0.97) à l'appui, au lieu de
    ne rien faire ou d'annuler le lift.
  - Le relâchement revient net à l'état hover/repos.
  - DevTools Animations panel à 10% : la compression est visible et
    symétrique avec le relâchement.
- **Done when** : les deux classes ont un `:active { transform:
  scale(0.97); }`, identique à `.dash-vide__cta` du même fichier.
