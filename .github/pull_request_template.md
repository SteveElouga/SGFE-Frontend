<!--
Absent avant cette tâche (docs/CHAINE_DE_LIVRAISON.md §11.6, symétrie avec le
backend qui en a un). Checklist courte : ce que `ci.yml` ne peut pas vérifier
lui-même (impact fonctionnel, captures d'écran, budgets) plutôt qu'une
redite de ce que les jobs automatiques couvrent déjà.
-->

## Quoi et pourquoi

<!-- Ce que ce changement fait, et le besoin ou le défaut qui le motive. -->

## Vérifications

- [ ] `npm run verify:types` passe (types + gabarits — `ng build` couvre ce que `tsc` seul ne voit pas)
- [ ] `npm run verify:codegen` passe si une requête/mutation GraphQL a changé
- [ ] Tests unitaires à jour (`ng test`) — nouveaux tests si le changement touche de la logique testable
- [ ] Tests e2e (`e2e/specs/`) à jour si le parcours qu'ils couvrent a changé
- [ ] `ng build --configuration production` reste sous les budgets de `angular.json` — si un budget est dépassé, le gaspillage a été cherché avant de le relever (voir CLAUDE.md, « Budgets de build »)
- [ ] Écran terrain (`features/terrain/`) : testé sur mobile (320–390px) si ce changement le touche

## Impact

- [ ] Migration ou changement de contrat GraphQL — impact côté gateway/backend vérifié
- [ ] Changement visuel — capture d'écran ou GIF joint(e)
- [ ] Aucun impact utilisateur (refactor, CI, doc)

## Hors périmètre

<!-- Ce que cette PR ne traite délibérément pas, et pourquoi (renvoi vers une
issue ou une section de doc si pertinent). -->
