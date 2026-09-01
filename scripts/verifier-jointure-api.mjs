#!/usr/bin/env node
//
// Vérifie que le proxy du serveur de développement et le nginx de production
// desservent le MÊME ensemble de chemins d'API.
//
// ── Pourquoi ce script existe ────────────────────────────────────────────────
//
// `proxy.conf.json` couvrait six familles de chemins ; le nginx de production
// n'en couvrait que deux. Les quatre autres — PDF de facture, exports CSV,
// synthèse, bilan des impayés — tombaient donc dans le fallback SPA et
// renvoyaient `index.html` avec un code **200**.
//
// C'est le pire mode de défaillance possible : « Télécharger le PDF » livrait
// une page HTML, sans erreur, sans journal, et seulement en production. Rien
// dans les tests ni dans la revue ne pouvait l'attraper, parce que les deux
// fichiers sont justes séparément — c'est leur désaccord qui est faux.
//
// Le script ne compare pas des chaînes : il prend chaque chemin d'exemple, le
// confronte aux règles de chaque côté, et échoue si un côté le proxyfie et pas
// l'autre.
//
//   node scripts/verifier-jointure-api.mjs

import { readFileSync } from 'node:fs';

const PROXY = 'proxy.conf.json';
const NGINX = 'nginx/conf.d/default.conf';

// Un chemin réel par famille servie par la gateway. Ajouter une famille au
// produit veut dire ajouter une ligne ici — et le script dira alors lequel des
// deux fichiers l'a oubliée.
const CHEMINS = [
  '/graphql',
  '/espace-abonne/tok123/',
  '/espace-abonne/tok123/facture/f1/pdf/',
  '/espace-abonne/tok123/factures.csv',
  '/factures/f1/pdf/',
  '/paiements/p1/recu/pdf/',
  '/rapports/factures.csv',
  '/rapports/paiements.csv',
  '/rapports/synthese/c1/',
  '/bilan-impayes',
];

/** Les clés de `proxy.conf.json` : un préfixe, ou une regex si elle commence par `^`. */
function proxyfieParLeServeurDeDev(chemin, contextes) {
  return contextes.some((c) =>
    c.startsWith('^') ? new RegExp(c).test(chemin) : chemin.startsWith(c),
  );
}

/**
 * Résolution des `location` de nginx, dans son ordre à lui : le préfixe le plus
 * long d'abord, mais une regex qui matche l'emporte sur le préfixe.
 */
function proxyfieParNginx(chemin, { prefixes, regexes }) {
  if (regexes.some((r) => new RegExp(r.motif).test(chemin) && r.versApi)) return true;
  if (regexes.some((r) => new RegExp(r.motif).test(chemin) && !r.versApi)) return false;

  const gagnant = prefixes
    .filter((p) => chemin.startsWith(p.motif))
    .sort((a, b) => b.motif.length - a.motif.length)[0];
  return Boolean(gagnant?.versApi);
}

function lireNginx(texte) {
  const prefixes = [];
  const regexes = [];

  // Un bloc `location` et son corps jusqu'à l'accolade fermante de même niveau.
  // Suffisant ici : aucune `location` d'API n'imbrique de sous-bloc.
  const re = /location\s+(=\s+|~\*\s+|~\s+|\^~\s+)?([^\s{]+)\s*\{([^}]*)\}/g;
  for (const [, modificateur = '', motif, corps] of texte.matchAll(re)) {
    // « Vers l'API » = le bloc proxyfie, directement ou par l'include partagé.
    const versApi = /proxy_pass|api_proxy\.conf/.test(corps);
    const estRegex = modificateur.trim() === '~' || modificateur.trim() === '~*';
    (estRegex ? regexes : prefixes).push({ motif, versApi });
  }
  return { prefixes, regexes };
}

const contextes = Object.keys(JSON.parse(readFileSync(PROXY, 'utf8')));
const nginx = lireNginx(readFileSync(NGINX, 'utf8'));

const ecarts = [];
for (const chemin of CHEMINS) {
  const dev = proxyfieParLeServeurDeDev(chemin, contextes);
  const prod = proxyfieParNginx(chemin, nginx);
  if (dev !== prod) {
    ecarts.push(
      `  ${chemin}\n` +
        `      ${PROXY} : ${dev ? 'proxyfié' : 'NON proxyfié'}\n` +
        `      ${NGINX} : ${prod ? 'proxyfié' : "NON proxyfié — tomberait dans le fallback SPA (index.html, code 200)"}`,
    );
  }
}

if (ecarts.length > 0) {
  console.error(
    `\n✗ Le développement et la production ne desservent pas les mêmes chemins d'API :\n\n${ecarts.join('\n\n')}\n\n` +
      `Un chemin proxyfié d'un seul côté marche en local et renvoie index.html en\n` +
      `production, avec un code 200 et sans erreur visible.\n`,
  );
  process.exit(1);
}

console.log(`✓ ${CHEMINS.length} chemins d'API desservis identiquement en développement et en production`);
