import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildClientSchema,
  Kind,
  NoUnusedFragmentsRule,
  parse,
  specifiedRules,
  validate,
  visit,
  type DocumentNode,
  type FragmentDefinitionNode,
  type IntrospectionQuery,
} from 'graphql';
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
 *
 * L'interpolation `${FRAGMENT}` est retirée du texte : elle ne porte aucune
 * information que le fragment lui-même ne porte pas, et le fragment est
 * retrouvé plus loin par son nom. Cette fonction sautait autrefois ces
 * documents ; ils sont passés de 4 à 19 le jour où les sélections partagées ont
 * été extraites en fragments, et la garde aurait alors cessé de couvrir un
 * cinquième du dépôt — dont chaque document qu'on venait de modifier.
 */
function documents(): Document[] {
  const trouves: Document[] = [];
  // `export` est optionnel : les fragments locaux d'un fichier de mutations
  // (`const USER_FIELDS = gql\`…\``) ne sont pas exportés, et sans eux les
  // opérations qui les étalent échouaient sur « Unknown fragment ».
  const motif = /(?:export )?const (\w+)(?::[^=]+)?\s*=\s*gql`([\s\S]*?)`;/g;

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (chemin.endsWith('.ts') && !chemin.endsWith('.spec.ts')) {
        const texte = readFileSync(chemin, 'utf8');
        for (const m of texte.matchAll(motif)) {
          trouves.push({ nom: m[1], source: m[2].replace(/\$\{[^}]*\}/g, ''), fichier: chemin });
        }
      }
    }
  };
  parcourir('src/app');
  return trouves;
}

/**
 * Les fragments du dépôt, par nom.
 *
 * Un fragment vit dans un fichier, les opérations qui s'en servent dans
 * d'autres. Pour valider une opération, il faut lui redonner les définitions
 * qu'elle mentionne — sinon `graphql.validate` rend « Unknown fragment » et la
 * garde échoue pour la mauvaise raison.
 */
function fragments(docs: readonly Document[]): Map<string, FragmentDefinitionNode> {
  const par = new Map<string, FragmentDefinitionNode>();
  for (const doc of docs) {
    let ast;
    try {
      ast = parse(doc.source);
    } catch {
      continue; // la syntaxe est jugée ailleurs, sur l'opération elle-même
    }
    for (const def of ast.definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) par.set(def.name.value, def);
    }
  }
  return par;
}

/**
 * Les fragments qu'un document utilise, transitivement.
 *
 * Transitivement parce qu'un fragment peut en étaler un autre. Et seulement
 * ceux-là : `validate` refuse aussi un fragment défini et jamais utilisé, donc
 * tout joindre en bloc ferait échouer chaque document.
 */
function fragmentsUtilises(
  noeud: DocumentNode | FragmentDefinitionNode,
  disponibles: Map<string, FragmentDefinitionNode>,
  vus = new Set<string>(),
): FragmentDefinitionNode[] {
  const retenus: FragmentDefinitionNode[] = [];
  visit(noeud, {
    FragmentSpread(spread) {
      const nom = spread.name.value;
      if (vus.has(nom)) return;
      vus.add(nom);
      const def = disponibles.get(nom);
      if (!def) return; // signalé par `validate` comme « Unknown fragment »
      retenus.push(def, ...fragmentsUtilises(def, disponibles, vus));
    },
  });
  return retenus;
}

describe('contrat GraphQL', () => {
  const docs = documents();
  const parNom = fragments(docs);

  it('trouve les documents du frontend', () => {
    // Un extracteur qui ne trouve rien passerait tous les tests suivants sans
    // rien vérifier — c'est le mode de panne le plus discret d'une garde.
    expect(docs.length).toBeGreaterThan(90);
  });

  it('valide aussi les documents composés par interpolation', () => {
    // Le seuil dit ce que la garde couvre. Il tombe si un `${FRAGMENT}`
    // recommence à faire sauter un document au lieu d'être résolu.
    const composes = docs.filter((d) => /\.\.\.\w+/.test(d.source));
    expect(composes.length).toBeGreaterThanOrEqual(15);
    expect(parNom.size).toBeGreaterThanOrEqual(5);
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
      const complet: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [...ast.definitions, ...fragmentsUtilises(ast, parNom)],
      };
      // Un document qui ne contient qu'un fragment (`fragments.ts`) n'est pas
      // exécutable : « Fragment X is never used » y est la règle qui s'applique
      // mal, pas le document qui est fautif. Tout le reste est vérifié — que ses
      // champs existent bien sur le type, notamment, ce qui est l'essentiel.
      const seulementFragments = complet.definitions.every(
        (d) => d.kind === Kind.FRAGMENT_DEFINITION,
      );
      const regles = seulementFragments
        ? specifiedRules.filter((r) => r !== NoUnusedFragmentsRule)
        : specifiedRules;
      const erreurs = validate(SCHEMA, complet, regles);
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
      'nouvellePosition',
    ]);
  });
});
