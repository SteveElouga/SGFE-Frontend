#!/usr/bin/env node
/**
 * Régénère l'instantané des types d'entrée GraphQL depuis une gateway en marche.
 *
 *     node scripts/rafraichir-schema.mjs [url]
 *
 * L'instantané sert de référence au test `src/app/graphql/schema-contrat.spec.ts`.
 * Il existe parce que TypeScript ne voit rien des variables d'une mutation :
 * elles traversent Apollo sous forme d'objet libre, et le compilateur vérifie
 * qu'elles correspondent à l'interface locale — pas que l'interface locale
 * corresponde au serveur. `remplacerCompteur` a vécu ainsi avec cinq champs sur
 * six portant des noms qui n'existaient nulle part côté gateway.
 *
 * À lancer après toute modification d'un input côté backend. Le test tombera
 * de lui-même entre-temps, ce qui est le but.
 */
import { writeFileSync } from 'node:fs';

const URL_GATEWAY = process.argv[2] ?? 'http://localhost:8080/graphql';
const SORTIE = new URL('../src/app/graphql/schema-entrees.json', import.meta.url);

const REQUETE = `{
  __schema {
    types {
      name
      kind
      inputFields {
        name
        defaultValue
        type { kind name ofType { kind name ofType { kind name } } }
      }
    }
  }
}`;

function rendre(t) {
  if (t.kind === 'NON_NULL') return rendre(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + rendre(t.ofType) + ']';
  return t.name;
}

const reponse = await fetch(URL_GATEWAY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: REQUETE }),
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

const entrees = {};
for (const t of data.__schema.types) {
  if (t.kind !== 'INPUT_OBJECT' || t.name.startsWith('__')) continue;
  entrees[t.name] = Object.fromEntries(
    [...(t.inputFields ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => [
        f.name,
        { requis: f.type.kind === 'NON_NULL' && f.defaultValue === null, type: rendre(f.type) },
      ]),
  );
}

const nb = Object.keys(entrees).length;
if (nb === 0) {
  console.error('[schema] Aucun type d’entrée trouvé — instantané non écrit.');
  process.exit(1);
}

writeFileSync(SORTIE, JSON.stringify(entrees, null, 2) + '\n');
console.log(`[schema] ${nb} types d’entrée écrits dans src/app/graphql/schema-entrees.json`);
