#!/usr/bin/env node
//
// Vérifie que tout écran hébergeant `<app-data-table>` pose la classe
// partagée `.screen-flex-fill` sur son wrapper.
//
// ── Pourquoi ce script existe ────────────────────────────────────────────────
//
// `<app-data-table>` gère son propre défilement interne (en-tête collant,
// pagination hors défilement) — son `:host` a besoin d'un ancêtre
// flex-column borné pour que son `flex: 1` ne soit pas inerte (voir
// `data-table.component.scss` et `styles/global.scss`, où `.screen-flex-fill`
// est documentée en détail). Sans elle, le tableau s'affiche à sa pleine
// hauteur de contenu, silencieusement — aucune erreur, aucun avertissement,
// juste un tableau qui ne défile plus comme les autres.
//
// C'est arrivé une fois : `diffusion-form` (`.dfc-card--table`) ne l'avait
// jamais reçue alors que sept autres écrans à `<app-data-table>` l'avaient
// chacun réinventée à la main, indépendamment, avec un nom de classe et un
// paragraphe d'explication différents à chaque fois. Ce script attrape le
// prochain oubli avant qu'il ne devienne un HUITIÈME correctif ponctuel.
//
// Vérification volontairement simple (présence de la classe dans le même
// fichier), pas une analyse d'arborescence DOM complète — comme
// `verifier-defilement-pages.mjs`, dont ce script reprend le principe.
//
//   node scripts/verifier-defilement-tableau.mjs

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GABARIT_GLOB = 'src/app/features';

/** Le gabarit utilise-t-il réellement `<app-data-table`, hors commentaires ? */
function utiliseDataTable(html) {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
  return /<app-data-table\b/.test(sansCommentaires);
}

/** La classe est-elle réellement appliquée quelque part dans le gabarit ? */
function porteScreenFlexFill(html) {
  const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
  return (
    /\bclass\s*=\s*["'][^"']*\bscreen-flex-fill\b/.test(sansCommentaires) ||
    /\[class\.screen-flex-fill\]/.test(sansCommentaires) ||
    /\[(?:class|ngClass)\]\s*=\s*"[^"]*screen-flex-fill/.test(sansCommentaires)
  );
}

// Liste des gabarits `.html` via `git ls-files` — évite de dépendre d'un glob
// tiers et reste cohérent avec ce que le dépôt suit réellement.
const fichiers = execSync(`git ls-files -- ${GABARIT_GLOB}`, { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.component.html'));

const manquants = [];
let concernes = 0;

for (const fichier of fichiers) {
  const html = readFileSync(fichier, 'utf8');
  if (!utiliseDataTable(html)) continue;
  concernes += 1;
  if (!porteScreenFlexFill(html)) manquants.push(fichier);
}

if (manquants.length > 0) {
  console.error(
    `\n✗ ${manquants.length} écran(s) utilisent <app-data-table> sans poser ` +
      `\`.screen-flex-fill\` sur son wrapper :\n\n` +
      manquants.map((f) => `    ${f}`).join('\n') +
      `\n\n` +
      `  Ajouter la classe \`screen-flex-fill\` sur l'élément qui contient\n` +
      `  directement <app-data-table> (la carte visuelle qui l'entoure), pas\n` +
      `  sur \`.page-scroll\` lui-même — voir styles/global.scss et le\n` +
      `  commentaire du \`:host\` dans data-table.component.scss.\n\n`,
  );
  process.exit(1);
}

console.log(
  `✓ Tous les écrans à <app-data-table> posent \`.screen-flex-fill\` sur leur wrapper (${concernes} écran(s) concerné(s))`,
);
