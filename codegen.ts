import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Types TypeScript dérivés du schéma de la gateway ET de la sélection réelle.
 *
 * Le point important est le second : un type généré décrit ce que la requête
 * **demande**, pas ce que le serveur pourrait rendre. C'est cette différence
 * qui attrape la classe de panne qui a coûté le plus cher ici.
 *
 * Trois écrans en portaient un exemplaire au moment d'écrire ce fichier. Le
 * mécanisme était le même à chaque fois :
 *
 *   `facture.model.ts` déclare `motifAnnulation?: string`, `GET_FACTURE` ne
 *   demande jamais ce champ, et `facture-detail.component.html` teste
 *   `@if (f.motifAnnulation)`. Le compilateur est content — le champ existe
 *   dans l'interface, il est optionnel. La valeur est `undefined` pour
 *   toujours, et le bandeau d'annulation n'a jamais pu s'afficher.
 *
 *   `campagne.model.ts` déclare `genererFacturesAuto?: boolean`, `GET_CAMPAGNE`
 *   ne le demande pas, et `factures-list.component.html` teste
 *   `=== false`. `undefined === false` est faux : la bannière expliquant que
 *   les factures ne sont pas générées automatiquement n'est jamais apparue.
 *
 *   `Facture.nature` non demandé, et `annuler-sheet` décide sur
 *   `f.nature !== 'REGULARISATION'` — donc toujours vrai.
 *
 * Un champ optionnel jamais rempli et un champ optionnel absent de la requête
 * sont indistinguables dans une interface écrite à la main. Ils ne le sont
 * plus dans un type généré : le champ n'existe pas, et `f.motifAnnulation`
 * casse la compilation du gabarit.
 *
 * Le schéma est l'instantané d'introspection déjà versionné, celui que
 * `schema-contrat.spec.ts` utilise pour valider les documents. Une seule source
 * de vérité pour les deux gardes : elles vieillissent ensemble, et
 * `scripts/rafraichir-schema.mjs` les rafraîchit ensemble.
 */
const config: CodegenConfig = {
  schema: 'src/app/graphql/schema-introspection.json',
  documents: ['src/app/graphql/**/*.ts', '!src/app/graphql/**/*.spec.ts', '!src/app/graphql/generated.ts', '!src/app/graphql/vues.ts'],
  ignoreNoDocuments: false,
  generates: {
    'src/app/graphql/generated.ts': {
      // `typescript-operations` seul, et non le duo habituel avec `typescript`.
      // Deux raisons, une technique et une de fond.
      //
      // Technique : en codegen 7, les deux greffons émettent tous les deux les
      // types d'entrée et les énumérations du schéma — 13 déclarations en
      // double dans un seul fichier, donc treize `TS2300: Duplicate
      // identifier`. `typescript-operations` est autonome : il émet les entrées
      // et les énumérations dont ses opérations ont besoin.
      //
      // De fond : ce que `typescript` ajouterait, ce sont les types du schéma
      // (`Facture`, `Campagne`, …) — soit exactement la forme « tout ce que le
      // serveur pourrait rendre » qui a produit les trois pannes muettes.
      // L'offrir toute faite serait inviter à y revenir.
      plugins: ['typescript-operations'],
      config: {
        // Apollo ajoute `__typename` aux requêtes lui-même, mais aucun écran ne
        // le lit : le garder dans les types n'ajouterait que du bruit.
        skipTypename: true,
        // Des types d'union plutôt que des `enum` : ce fichier ne doit produire
        // aucun code à l'exécution, seulement des types. Un `enum` TypeScript,
        // lui, émet un objet.
        enumsAsTypes: true,
        // `string | null` plutôt que `Maybe<string>` : le nullable du schéma se
        // lit alors directement, sans passer par un alias.
        maybeValue: 'T | null',
        // Les variables d'entrée gardent leur optionalité du schéma — une
        // variable à valeur par défaut ne doit pas devenir obligatoire.
        avoidOptionals: { field: false, inputValue: false, object: false },
        useTypeImports: true,
        immutableTypes: false,
      },
    },
  },
};

export default config;
