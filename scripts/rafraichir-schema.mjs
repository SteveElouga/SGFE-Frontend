#!/usr/bin/env node
/**
 * Capture le schéma GraphQL complet de la gateway, par introspection.
 *
 *     node scripts/rafraichir-schema.mjs [url]
 *
 * L'instantané sert de référence au test `src/app/graphql/schema-contrat.spec.ts`,
 * qui valide chaque document `gql` du frontend contre lui.
 *
 * Il existe parce que TypeScript ne voit rien d'une requête GraphQL : ni les
 * variables, ni les champs sélectionnés. Deux pannes l'ont montré. Un input dont
 * cinq champs sur six portaient des noms inexistants côté serveur, qui faisait
 * échouer tout remplacement de compteur. Et un champ demandé en sortie avant
 * que la gateway déployée ne l'expose, qui vidait l'écran d'une facture d'un
 * « Cannot query field ». Dans les deux cas : compilation verte, tests verts,
 * fonctionnalité morte.
 *
 * À relancer après toute modification du schéma côté backend. Entre-temps le
 * test tombe de lui-même, ce qui est le but.
 */
import { writeFileSync } from 'node:fs';
import { getIntrospectionQuery } from 'graphql';

const URL_GATEWAY = process.argv[2] ?? 'http://localhost:8080/graphql';
const SORTIE = new URL('../src/app/graphql/schema-introspection.json', import.meta.url);

const reponse = await fetch(URL_GATEWAY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: getIntrospectionQuery() }),
}).catch((err) => {
  console.error(`[schema] Gateway injoignable sur ${URL_GATEWAY} : ${err.message}`);
  process.exit(1);
});

if (!reponse.ok) {
  console.error(`[schema] La gateway a répondu ${reponse.status}`);
  process.exit(1);
}

const { data, errors } = await reponse.json();
if (errors) {
  console.error('[schema] Introspection refusée :', JSON.stringify(errors));
  process.exit(1);
}
if (!data?.__schema?.types?.length) {
  console.error('[schema] Introspection vide — instantané non écrit.');
  process.exit(1);
}

writeFileSync(SORTIE, JSON.stringify(data, null, 2) + '\n');
const nb = data.__schema.types.filter((t) => !t.name.startsWith('__')).length;
console.log(`[schema] ${nb} types écrits dans src/app/graphql/schema-introspection.json`);
