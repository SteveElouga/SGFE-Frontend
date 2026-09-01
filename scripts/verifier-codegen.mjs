#!/usr/bin/env node
/**
 * `generated.ts` est-il à jour avec les documents du dépôt ?
 *
 * Un fichier généré versionné a un mode de panne propre : quelqu'un modifie une
 * requête, oublie `npm run codegen`, et les types continuent de décrire
 * l'ancienne sélection. La compilation passe — elle vérifie la cohérence avec
 * un fichier périmé — et la garde qu'on vient de construire se met à mentir
 * exactement comme les interfaces qu'elle remplace.
 *
 * Ce script régénère dans un fichier temporaire et compare. Il ne réécrit
 * jamais le fichier du dépôt : en intégration continue, on veut savoir, pas
 * corriger en silence.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CIBLE = 'src/app/graphql/generated.ts';

const dossier = mkdtempSync(join(tmpdir(), 'sgfe-codegen-'));
const temoin = join(dossier, 'generated.ts');
const config = join(dossier, 'codegen.temoin.ts');

try {
  // La même configuration, une seule sortie déplacée. La lire plutôt que la
  // recopier évite le troisième mode de panne : une garde qui vérifie autre
  // chose que ce que produit `npm run codegen`.
  const source = readFileSync('codegen.ts', 'utf8');
  if (!source.includes(`'${CIBLE}'`)) {
    console.error(`✗ codegen.ts ne génère plus « ${CIBLE} » — cette garde ne sait plus quoi comparer.`);
    process.exit(1);
  }
  writeFileSync(config, source.replace(`'${CIBLE}'`, JSON.stringify(temoin)));

  execFileSync('npx', ['graphql-codegen', '--config', config], { stdio: 'pipe' });

  const attendu = readFileSync(temoin, 'utf8');
  const present = readFileSync(CIBLE, 'utf8');

  if (attendu === present) {
    const operations = (present.match(/^export type \w+(Query|Mutation|Subscription) =/gm) ?? []).length;
    const fragments = (present.match(/^export type \w+Fragment =/gm) ?? []).length;
    console.log(`✓ ${CIBLE} à jour — ${operations} opérations, ${fragments} fragments.`);
    process.exit(0);
  }

  // Le nombre de lignes qui diffèrent situe l'écart sans imprimer 700 lignes.
  const a = attendu.split('\n');
  const p = present.split('\n');
  const premiere = a.findIndex((ligne, i) => ligne !== p[i]);
  console.error(`✗ ${CIBLE} est périmé.`);
  console.error(`  première divergence à la ligne ${premiere + 1} :`);
  console.error(`    versionné : ${(p[premiere] ?? '(fin de fichier)').slice(0, 120)}`);
  console.error(`    régénéré  : ${(a[premiere] ?? '(fin de fichier)').slice(0, 120)}`);
  console.error('  → lancer « npm run codegen » et versionner le résultat.');
  process.exit(1);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
