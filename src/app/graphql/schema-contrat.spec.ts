import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildClientSchema, parse, validate, type IntrospectionQuery } from 'graphql';
import introspection from './schema-introspection.json';

/**
 * Chaque requête et mutation du frontend, validée contre le schéma réel.
 *
 * TypeScript ne voit rien d'un document GraphQL : ni les variables, ni les
 * champs sélectionnés. Le compilateur vérifie qu'un objet correspond à une
 * interface locale, jamais que cette interface correspond au serveur. Deux
 * pannes l'ont montré, à quelques heures d'intervalle.
 *
 * `remplacerCompteur` envoyait cinq champs sur six sous des noms qui n'existent
 * nulle part côté gateway. Le remplacement de compteur n'a donc jamais
 * fonctionné.
 *
 * `GetSoldeFacture` a demandé `avoirImpute` avant que la gateway déployée ne
 * l'expose : l'écran d'une facture s'est vidé sur un « Cannot query field ».
 *
 * Dans les deux cas, la compilation passait, les tests passaient, et la seule
 * chose qui échouait était la fonctionnalité — devant l'utilisateur.
 *
 * `graphql.validate` fait ce travail complètement : variables, champs, types,
 * arguments, fragments. Il ne restait qu'à lui donner le schéma.
 *
 * L'instantané se régénère avec `node scripts/rafraichir-schema.mjs` sur une
 * gateway en marche. Il vieillit, et c'est voulu : quand le backend change son
 * schéma, ce test tombe — précisément au moment où l'on veut l'apprendre.
 */

const SCHEMA = buildClientSchema(introspection as unknown as IntrospectionQuery);

/** Un document `gql` trouvé dans les sources, avec sa provenance. */
interface Document {
  nom: string;
  source: string;
  fichier: string;
}

/**
 * Extrait les documents `gql` des sources.
 *
 * On lit le texte plutôt que d'importer les modules : importer exécuterait
 * `gql`, qui accepte n'importe quoi — c'est justement le problème qu'on essaie
 * d'attraper.
 */
function documents(): Document[] {
  const trouves: Document[] = [];
  const motif = /export const (\w+)\s*=\s*gql`([\s\S]*?)`;/g;

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (chemin.endsWith('.ts') && !chemin.endsWith('.spec.ts')) {
        const texte = readFileSync(chemin, 'utf8');
        for (const m of texte.matchAll(motif)) {
          // Les documents composés par interpolation (`${FRAGMENT}`) ne peuvent
          // pas être validés isolément : leur fragment vit ailleurs.
          if (m[2].includes('${')) continue;
          trouves.push({ nom: m[1], source: m[2], fichier: chemin });
        }
      }
    }
  };
  parcourir('src/app');
  return trouves;
}

describe('contrat GraphQL', () => {
  const docs = documents();

  it('trouve les documents du frontend', () => {
    // Un extracteur qui ne trouve rien passerait tous les tests suivants sans
    // rien vérifier — c'est le mode de panne le plus discret d'une garde.
    expect(docs.length).toBeGreaterThan(20);
  });

  it('l’instantané du schéma est exploitable', () => {
    expect(SCHEMA.getQueryType()).toBeTruthy();
    expect(SCHEMA.getMutationType()).toBeTruthy();
  });

  it('chaque document est valide contre le schéma de la gateway', () => {
    const fautifs: string[] = [];

    for (const doc of docs) {
      let ast;
      try {
        ast = parse(doc.source);
      } catch (err) {
        fautifs.push(`${doc.nom} (${doc.fichier}) → syntaxe : ${(err as Error).message}`);
        continue;
      }
      const erreurs = validate(SCHEMA, ast);
      for (const e of erreurs) {
        fautifs.push(`${doc.nom} (${doc.fichier}) → ${e.message}`);
      }
    }

    // Le tableau plutôt qu'un booléen : quand ça tombe, on veut lire quel
    // document et quel champ, pas « attendu true, reçu false ».
    expect(fautifs).toEqual([]);
  });

  it('le remplacement de compteur distingue bien les deux compteurs', () => {
    // Le cas qui a motivé ce fichier. La mutation manipule celui qu'on archive
    // et celui qu'on pose ; un champ nommé « numeroCompteur » ne dit pas duquel
    // il parle, et c'est cette ambiguïté qui avait produit l'erreur.
    const entree = SCHEMA.getType('RemplacerCompteurInput');
    expect(entree).toBeTruthy();
    const champs = Object.keys((entree as { getFields(): object }).getFields()).sort();
    expect(champs).toEqual([
      'dateRemplacement',
      'indexFermeture',
      'motif',
      'nouveauCamp',
      'nouveauNumeroCompteur',
      'nouveauQuartier',
      'nouvelIndexInitial',
    ]);
  });
});
