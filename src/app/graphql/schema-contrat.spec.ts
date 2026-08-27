import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import schemaEntrees from './schema-entrees.json';

/**
 * Le contrat d'entrée GraphQL, vérifié contre un instantané du schéma.
 *
 * TypeScript ne voit rien des variables d'une mutation : elles traversent
 * Apollo sous forme d'objet libre, et le compilateur valide qu'elles
 * correspondent à l'interface locale — pas que l'interface locale corresponde
 * au serveur. `remplacerCompteur` a vécu ainsi avec cinq champs sur six portant
 * des noms qui n'existaient nulle part côté gateway : la compilation passait,
 * les tests passaient, et la fonctionnalité échouait à chaque tentative.
 *
 * L'instantané `schema-entrees.json` se régénère avec
 * `node scripts/rafraichir-schema.mjs` sur une gateway en marche. Quand le
 * backend change une entrée, ce test tombe — ce qui est précisément le moment
 * où l'on veut l'apprendre.
 */

type ChampSchema = { type: string; requis: boolean };
const SCHEMA = schemaEntrees as Record<string, Record<string, ChampSchema>>;

/** Interfaces `*Input` déclarées dans le frontend, avec leurs champs. */
function interfacesLocales(): Map<string, { champs: Set<string>; fichier: string }> {
  const trouvees = new Map<string, { champs: Set<string>; fichier: string }>();
  const motif = /export interface (\w*Input)\s*\{([\s\S]*?)\n\}/g;

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (chemin.endsWith('.ts') && !chemin.endsWith('.spec.ts')) {
        const source = readFileSync(chemin, 'utf8');
        for (const m of source.matchAll(motif)) {
          const champs = new Set(
            [...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map((c) => c[1]),
          );
          if (champs.size > 0) trouvees.set(m[1], { champs, fichier: chemin });
        }
      }
    }
  };
  parcourir('src/app');
  return trouvees;
}

describe('contrat GraphQL — entrées', () => {
  const locales = interfacesLocales();

  it('l’instantané du schéma est présent et non vide', () => {
    expect(Object.keys(SCHEMA).length).toBeGreaterThan(0);
  });

  it('aucune interface n’envoie un champ que le serveur ignore', () => {
    const fautifs: string[] = [];
    for (const [nom, { champs, fichier }] of locales) {
      const serveur = SCHEMA[nom];
      if (!serveur) continue;
      const inconnus = [...champs].filter((c) => !(c in serveur)).sort();
      if (inconnus.length > 0) fautifs.push(`${nom} (${fichier}) → ${inconnus.join(', ')}`);
    }
    expect(fautifs).toEqual([]);
  });

  it('aucune interface n’omet un champ obligatoire', () => {
    const fautifs: string[] = [];
    for (const [nom, { champs, fichier }] of locales) {
      const serveur = SCHEMA[nom];
      if (!serveur) continue;
      const manquants = Object.entries(serveur)
        .filter(([c, d]) => d.requis && !champs.has(c))
        .map(([c]) => c)
        .sort();
      if (manquants.length > 0) fautifs.push(`${nom} (${fichier}) → ${manquants.join(', ')}`);
    }
    expect(fautifs).toEqual([]);
  });

  it('le remplacement de compteur distingue bien les deux compteurs', () => {
    // Le cas qui a motivé ce fichier : la mutation manipule celui qu'on archive
    // et celui qu'on pose. Un champ nommé « numeroCompteur » ne dit pas duquel
    // il parle, et c'est l'ambiguïté qui avait produit l'erreur.
    const serveur = SCHEMA['RemplacerCompteurInput'];
    expect(serveur).toBeDefined();
    expect(Object.keys(serveur).sort()).toEqual([
      'dateRemplacement',
      'indexFermeture',
      'motif',
      'nouveauCamp',
      'nouveauNumeroCompteur',
      'nouveauQuartier',
      'nouvelIndexInitial',
    ]);
    expect(locales.get('RemplacerCompteurInput')?.champs.has('numeroCompteur')).toBe(false);
  });
});
