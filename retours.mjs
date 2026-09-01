import { readFileSync, writeFileSync } from 'node:fs';

const services = [
  'src/app/core/factures/factures.service.ts',
  'src/app/core/campagnes/campagnes.service.ts',
  'src/app/core/abonnes/abonnes.service.ts',
  'src/app/core/dashboard/dashboard.service.ts',
  'src/app/core/users/users.service.ts',
  'src/app/core/configuration/configuration.service.ts',
];

// les types d'opération réellement générés, et leurs champs de premier niveau
const gen = readFileSync('src/app/graphql/generated.ts', 'utf8');
const champsDe = new Map();
for (const m of gen.matchAll(/^export type (\w+(?:Query|Mutation|Subscription)) = \{([^\n]*)\};$/gm)) {
  champsDe.set(m[1], new Set([...(' ' + m[2]).matchAll(/(?:^\s*|[{,]\s*)(\w+):/g)].map((x) => x[1])));
}

// les modèles écrits à la main — seuls ceux-là sont remplacés
const modeles = new Set();
for (const f of ['abonne', 'campagne', 'facture', 'user', 'configuration'])
  for (const m of readFileSync(`src/app/shared/models/${f}.model.ts`, 'utf8').matchAll(/export interface (\w+)/g))
    modeles.add(m[1]);

const ECRIRE = process.argv.includes('--ecrire');
const faits = [];
const refus = [];
for (const f of services) {
  let t = readFileSync(f, 'utf8');
  const METHODE = /^ {2}(?:(?:async|private|protected|public)\s+)*(\w+)\(([^]*?)\): Promise<([^>]*(?:<[^>]*>)?[^>]*)> \{([^]*?)\n {2}\}/gm;
  t = t.replace(METHODE, (tout, nom, args, retour, corps) => {
    // une signature ne traverse pas la fin d'une autre méthode
    if (args.includes('\n  }')) return tout;
    const gm = corps.match(/\.(?:query|mutate|watchQuery)<(\w+)>\(/);
    const rm = corps.match(/return\s+\w+\.data!?\??\.(\w+)/);
    if (!gm || !rm) return tout;
    const [op, champ] = [gm[1], rm[1]];
    // le modèle nu, avec ou sans [] et avec ou sans « | null »
    const mm = retour.match(/^(\w+)(\[\])?( \| null)?$/);
    if (!mm || !modeles.has(mm[1])) { refus.push(`${nom} · ${retour} n'est pas un modèle du dépôt`); return tout; }
    if (!champsDe.get(op)?.has(champ)) { refus.push(`${nom} · ${op} n'a pas de champ « ${champ} »`); return tout; }
    const nouveau = `${op}['${champ}']${mm[3] ?? ''}`;
    faits.push(`  ${nom.padEnd(26)} ${retour.padEnd(26)} → ${nouveau}`);
    return tout.replace(`): Promise<${retour}> {`, `): Promise<${nouveau}> {`);
  });
  if (ECRIRE) writeFileSync(f, t);
}
console.log(faits.join('\n'));
console.log(`\n${faits.length} signatures rétrécies sur la sélection`);
if (refus.length) console.log(`\nécartées (${refus.length}) :\n  ` + refus.join('\n  '));
