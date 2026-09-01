#!/usr/bin/env node
//
// Vérifie qu'aucun lien de navigation ne vise une route inexistante.
//
// ── Pourquoi ────────────────────────────────────────────────────────────────
//
// `app.routes.ts` se termine par `{ path: '**', redirectTo: 'login' }`. Un lien
// vers un chemin non déclaré ne produit donc **aucune erreur** : il renvoie
// l'utilisateur à l'écran de connexion.
//
// C'est arrivé deux fois dans le même composant : `['/facturation', id]` là où
// la route s'appelle `factures`. Après avoir annulé puis régénéré une facture,
// l'utilisateur se retrouvait au login — au moment précis où il voulait voir la
// facture corrigée. Les onze autres liens vers une facture du dépôt écrivaient
// bien `/factures`.
//
// ── Portée, et ce que ce script ne fait pas ─────────────────────────────────
//
// Il ne vérifie que le **premier segment** d'un chemin absolu littéral, contre
// l'ensemble de tous les segments déclarés dans `app.routes.ts`. C'est une
// approximation : un nom valide à un niveau imbriqué serait accepté au premier
// niveau. Elle suffit pour la faute qui coûte cher — un nom qui n'existe
// **nulle part** dans les routes — sans exiger de résoudre l'arbre complet.
//
// Les liens relatifs et les chemins construits dynamiquement sont hors de
// portée, et c'est assumé.
//
//   node scripts/verifier-liens-routes.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES = 'src/app/app.routes.ts';
const RACINE = 'src/app';

/** Tous les segments déclarés dans les routes, params retirés. */
function segmentsDeclares() {
  const source = readFileSync(ROUTES, 'utf8');
  const segments = new Set();
  for (const [, chemin] of source.matchAll(/\bpath:\s*'([^']*)'/g)) {
    if (!chemin || chemin === '**') continue;
    for (const s of chemin.split('/')) {
      if (s && !s.startsWith(':')) segments.add(s);
    }
  }
  return segments;
}

function fichiers(dossier, suffixes, acc = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) fichiers(chemin, suffixes, acc);
    else if (suffixes.some((s) => chemin.endsWith(s))) acc.push(chemin);
  }
  return acc;
}

/** Les premiers segments visés par un lien absolu littéral, avec leur ligne. */
function liensDuFichier(chemin) {
  const lignes = readFileSync(chemin, 'utf8').split('\n');
  const trouves = [];
  lignes.forEach((ligne, i) => {
    // ['/xxx', …]  — navigate() et [routerLink] par tableau
    for (const [, seg] of ligne.matchAll(/\[\s*'\/([a-zA-Z][\w-]*)'/g)) {
      trouves.push({ segment: seg, ligne: i + 1 });
    }
    // routerLink="/xxx"  — forme chaîne
    for (const [, seg] of ligne.matchAll(/routerLink\s*=\s*"\/([a-zA-Z][\w-]*)/g)) {
      trouves.push({ segment: seg, ligne: i + 1 });
    }
  });
  return trouves;
}

const declares = segmentsDeclares();
if (declares.size === 0) {
  console.error(`✗ Aucun segment lu dans ${ROUTES} — le format a changé.\n`);
  process.exit(1);
}

const morts = [];
let examines = 0;

for (const fichier of fichiers(RACINE, ['.component.ts', '.component.html', '.service.ts', '.ts'])) {
  if (fichier.endsWith('.spec.ts') || fichier.endsWith('app.routes.ts')) continue;
  for (const { segment, ligne } of liensDuFichier(fichier)) {
    examines += 1;
    if (!declares.has(segment)) morts.push(`    ${fichier}:${ligne}  →  /${segment}`);
  }
}

if (morts.length > 0) {
  console.error(
    `\n✗ ${morts.length} lien(s) vers une route inexistante :\n\n${morts.join('\n')}\n\n` +
      `  Aucun de ces chemins n'est déclaré dans ${ROUTES}. Le joker final\n` +
      `  ({ path: '**', redirectTo: 'login' }) les capture : cliquer dessus\n` +
      `  déconnecte l'utilisateur, sans message ni erreur console.\n\n` +
      `  Segments déclarés : ${[...declares].sort().join(', ')}\n`,
  );
  process.exit(1);
}

console.log(`✓ ${examines} liens de navigation visent une route déclarée`);
