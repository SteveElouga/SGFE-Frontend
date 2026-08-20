#!/usr/bin/env node
/**
 * Garde-fou pre-commit : refuse tout `<app-bottom-sheet ...>` qui n'a
 * pas `labelledBy="..."` ou `ariaLabel="..."`.
 *
 * Un dialog sans nom accessible viole WCAG 4.1.2 (Name, Role, Value) :
 * VoiceOver/NVDA annoncent « dialog » sans titre. Voir critique terrain v3
 * (`.impeccable/critique/2026-07-28T21-28-28Z*.md`) — 6 des 7 sheets de l'app
 * étaient dans ce cas ; le fix a rétabli 7/7, ce script prévient la
 * régression sur les prochains callers.
 *
 * Usage :
 *   node scripts/check-bottom-sheet-a11y.mjs [<file>...]
 * Sans argument : scanne tout `src/**\/*.html`.
 * Avec arguments (pre-commit staged) : scanne juste les fichiers passés.
 * Exit 0 = clean, exit 2 = violations trouvées.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const files = process.argv.slice(2);
const targets = files.length
  ? files.filter((f) => f.endsWith('.html'))
  : execSync('find src -name "*.html" -type f', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

const violations = [];

// Regex : capture chaque ouverture `<app-bottom-sheet ...>` (multiline)
// jusqu'au `>` fermant de la balise (`[^>]*` ne mange pas de `>`).
const OPEN_TAG = /<app-bottom-sheet\b([^>]*)>/g;

for (const file of targets) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue; // fichier supprimé côté staged, on ignore
  }

  let match;
  while ((match = OPEN_TAG.exec(content)) !== null) {
    const attrs = match[1];
    const hasLabelledBy = /\blabelledBy\s*=/.test(attrs);
    const hasAriaLabel = /\bariaLabel\s*=/.test(attrs);
    if (hasLabelledBy || hasAriaLabel) continue;
    // Localise la ligne (grep 1-indexed).
    const line = content.substring(0, match.index).split('\n').length;
    violations.push({ file: path.relative(process.cwd(), file), line });
  }
}

if (violations.length === 0) {
  process.exit(0);
}

console.error(
  `\n❌ <app-bottom-sheet> sans nom accessible (WCAG 4.1.2) — ${violations.length} occurrence(s) :\n`,
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
}
console.error(
  `\nCorrectif : ajouter labelledBy="<id-du-titre>" ou ariaLabel="Titre".` +
    `\nExemple :` +
    `\n  <app-bottom-sheet [open]="open()" labelledBy="my-title" (close)="close.emit()">` +
    `\n    <h3 id="my-title">…</h3>` +
    `\n  </app-bottom-sheet>\n`,
);
process.exit(2);
