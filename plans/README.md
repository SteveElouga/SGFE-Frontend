# Plans d'animation — item #5 du backlog ("manque d'animation")

Générés par le skill `improve-animations` (Emil Kowalski), à partir de
l'audit du 2026-09-02 (commit `653168e`). Tous sélectionnés pour exécution.

| # | Titre | Sévérité | Statut |
|---|-------|----------|--------|
| 001 | Transition de route (View Transitions API) | Missed opportunity | DONE |
| 002 | Entrée de l'écran de succès terrain | Missed opportunity | DONE |
| 003 | Entrée des bannières hors-ligne / sync terrain | Missed opportunity | DONE |
| 004 | Press-scale des cartes dashboard | HIGH | DONE |
| 005 | Transition de couleur du badge de statut | MEDIUM | DONE |
| 006 | Entrée du badge de compteur de notifications | MEDIUM | DONE |
| 007 | Fondu squelette → contenu réel (data-table) | MEDIUM | DONE |
| 008 | Entrée du bandeau d'erreur | LOW | DONE |

Tous vérifiés : `npm run verify:types`, `ng test --watch=false` (222/222),
`ng build --configuration production` (657,78 kB initial, dans le budget),
et feel-check navigateur. Voir la note de vérification dans `001-route-transitions.md`
pour le seul point notable rencontré (erreur console dev-only, sans impact
production).

## Ordre d'exécution recommandé

Aucune dépendance entre les plans — fichiers disjoints sauf note ci-dessous.
Ordre par leverage (impact/effort) :

1. **004** (dashboard) — le plus haut impact, le plus petit effort (2 lignes).
2. **001** (routes) — impact le plus large, effort modéré (2 fichiers).
3. **002** (succès terrain) — symbolique, moment de design system dédié.
4. **005**, **006**, **008** — trois corrections de cohésion, même patron
   (`@starting-style` ou transition de couleur), indépendantes.
5. **003** (bannières terrain) — même patron que 006/008.
6. **007** (data-table) — plus large diffusion (~10 écrans) mais impact
   individuel plus discret ; nécessite une petite modification de template
   (classe `dt--squelette`), seul plan à toucher un fichier `.html` en plus
   du `.scss`.

## Note

Tous les plans réutilisent les jetons déjà établis (`--ease-out`,
`--duree-courte` 160ms, `--duree-moyenne` 220ms, `_tokens.scss:234-238`) et
le patron `@starting-style` déjà idiomatique dans ce dépôt pour les éléments
montés/démontés par `@if`/`@case` Angular (pas d'API `@angular/animations`
custom utilisée nulle part dans le code applicatif — confirmé par grep, 0
résultat pour `trigger(`/`animations: [`).

Aucun plan ne touche aux zones déjà conformes (bottom-sheet, toast,
barres de progression, popover/notif panel, sidebar tiroir, press-scale
global) — voir l'audit complet dans l'historique de conversation, non
reproduit ici pour éviter la duplication.
