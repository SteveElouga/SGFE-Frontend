#!/usr/bin/env node
//
// Vérifie que chaque écran routé DANS la coquille marque sa région défilante.
//
// ── L'invariant ──────────────────────────────────────────────────────────────
//
// Depuis que l'en-tête des pages est sorti du flux défilant, la coquille pose
// `overflow: hidden` (`shell.component.scss`) et force l'hôte de la route en
// colonne flex de hauteur bornée (`styles/global.scss`). Chaque page doit donc
// désigner elle-même la région qui défile, avec la classe `page-scroll`.
//
// Une page qui l'oublie ne produit aucune erreur : elle s'affiche, et **le bas
// de son contenu est simplement inatteignable**. Aucun test ne peut l'attraper,
// aucune relecture ne le voit — le gabarit est correct, c'est son accord avec la
// coquille qui ne l'est pas.
//
// C'est arrivé une fois : `utilisateurs/:id`, le seul des vingt écrans à ne pas
// la porter, et le seul à fabriquer son propre en-tête au lieu d'employer
// `app-page-topbar`.
//
//   node scripts/verifier-defilement-pages.mjs

import { readFileSync, existsSync } from 'node:fs';

const ROUTES = 'src/app/app.routes.ts';
const MARQUEUR_COQUILLE = "features/shell/shell.component";

// Écrans dispensés, et la raison de chacun. Une dispense sans raison n'en est
// pas une : c'est un oubli qu'on a rendu silencieux.
const DISPENSES = new Map([
  [
    'src/app/features/terrain/terrain.component.html',
    "défile en bloc, exception assumée et documentée dans terrain.component.scss",
  ],
]);

/**
 * La classe est-elle réellement APPLIQUÉE, et pas seulement mentionnée ?
 *
 * Un simple `html.includes('page-scroll')` se satisfait d'un commentaire qui
 * parle de la classe — y compris le commentaire qui explique pourquoi elle est
 * là. La première version de ce script portait ce défaut, et le test de sa
 * propre efficacité l'a montré : régression introduite, script vert.
 *
 * On retire donc les commentaires, puis on ne cherche la classe que dans un
 * attribut `class` — statique (`class="a page-scroll"`) ou lié
 * (`[class]`, `[ngClass]`, `[class.page-scroll]`).
 */
function porteUneRegionDefilante(html) {
  const html2 = html.replace(/<!--[\s\S]*?-->/g, '');
  return (
    // class="… page-scroll …"
    /\bclass\s*=\s*["'][^"']*\bpage-scroll\b/.test(html2) ||
    // [class.page-scroll]="…"
    /\[class\.page-scroll\]/.test(html2) ||
    // [class]="…page-scroll…" ou [ngClass]="…page-scroll…"
    /\[(?:class|ngClass)\]\s*=\s*"[^"]*page-scroll/.test(html2)
  );
}

const source = readFileSync(ROUTES, 'utf8');

const coupure = source.indexOf(MARQUEUR_COQUILLE);
if (coupure === -1) {
  console.error(
    `✗ ${ROUTES} : l'import de la coquille (${MARQUEUR_COQUILLE}) est introuvable.\n` +
      `  Ce script sépare les routes hors coquille (auth, espace abonné) de celles\n` +
      `  qui vivent dedans en coupant à cet import. Le renommage l'a cassé.\n`,
  );
  process.exit(1);
}

// Tout ce qui est importé APRÈS la coquille est routé DANS la coquille.
const dansLaCoquille = source.slice(coupure);
const gabarits = new Set();
for (const [, chemin] of dansLaCoquille.matchAll(/import\('\.\/(features\/[^']+)\.component'\)/g)) {
  gabarits.add(`src/app/${chemin}.component.html`);
}

if (gabarits.size === 0) {
  console.error(`✗ Aucun écran trouvé dans la coquille — le format des routes a changé.\n`);
  process.exit(1);
}

const manquants = [];
const introuvables = [];

for (const gabarit of [...gabarits].sort()) {
  if (DISPENSES.has(gabarit)) continue;
  if (!existsSync(gabarit)) {
    introuvables.push(gabarit);
    continue;
  }
  if (!porteUneRegionDefilante(readFileSync(gabarit, 'utf8'))) manquants.push(gabarit);
}

if (introuvables.length > 0) {
  console.error(
    `✗ Gabarits introuvables (composant sans templateUrl, ou renommé) :\n` +
      introuvables.map((f) => `    ${f}`).join('\n') +
      `\n`,
  );
  process.exit(1);
}

if (manquants.length > 0) {
  console.error(
    `\n✗ ${manquants.length} écran(s) routé(s) dans la coquille sans région défilante :\n\n` +
      manquants.map((f) => `    ${f}`).join('\n') +
      `\n\n` +
      `  Ajouter la classe \`page-scroll\` au bloc qui doit défiler (voir\n` +
      `  styles/global.scss). Sans elle, l'en-tête étant hors du flux, le bloc ne\n` +
      `  rétrécit pas sous son contenu et se fait rogner par l'overflow de la\n` +
      `  coquille : le bas de la page devient inatteignable, sans aucune erreur.\n\n` +
      `  Si l'écran défile autrement, l'inscrire dans DISPENSES avec sa raison.\n`,
  );
  process.exit(1);
}

const dispensees = [...DISPENSES.keys()].filter((f) => gabarits.has(f)).length;
console.log(
  `✓ ${gabarits.size - dispensees} écrans routés dans la coquille marquent leur région défilante` +
    (dispensees > 0 ? ` (${dispensees} dispensé(s), avec raison)` : ''),
);
