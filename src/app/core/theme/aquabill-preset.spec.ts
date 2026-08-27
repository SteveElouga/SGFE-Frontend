import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AquaBillPreset } from './aquabill-preset';

/**
 * Le préréglage n'embarque que les jetons des composants PrimeNG réellement
 * montés (voir `aquabill-preset.ts`) — les 77 autres coûtaient 74 kB dans le
 * bundle initial pour rien.
 *
 * Le risque de cet élagage est silencieux : monter un nouveau composant sans
 * ajouter sa clé le rendrait sans style, et rien ne planterait. Ce test ferme
 * le piège en confrontant la liste du préréglage aux imports `primeng/*` du
 * code source.
 */

/** Modules `primeng/*` qui ne portent aucun jeton de design. */
const SANS_JETONS = new Set(['api', 'config', 'dom', 'utils', 'base', 'basecomponent']);

/**
 * Modules dont les jetons vivent sous la clé d'un autre composant.
 * `p-inputIcon` est une directive placée dans un `p-iconField` : son style
 * est porté par `iconfield`.
 */
const ALIAS: Record<string, string> = { inputicon: 'iconfield' };

function fichiersSource(racine: string): string[] {
  return readdirSync(racine, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(racine, e.name);
    if (e.isDirectory()) return fichiersSource(chemin);
    return /\.(ts|html)$/.test(e.name) && !e.name.endsWith('.spec.ts') ? [chemin] : [];
  });
}

function modulesPrimeNgUtilises(): string[] {
  const modules = new Set<string>();
  for (const fichier of fichiersSource(join(process.cwd(), 'src', 'app'))) {
    const source = readFileSync(fichier, 'utf-8');
    for (const [, nom] of source.matchAll(/from ['"]primeng\/([a-z]+)['"]/g)) {
      if (!SANS_JETONS.has(nom)) modules.add(ALIAS[nom] ?? nom);
    }
  }
  return [...modules].sort();
}

describe('AquaBillPreset', () => {
  it('porte une clé de jetons pour chaque composant PrimeNG monté', () => {
    const attendus = modulesPrimeNgUtilises();
    const presents = Object.keys(AquaBillPreset.components ?? {});

    // Le message nomme le coupable : sans lui, l'échec dirait seulement
    // « false !== true » et laisserait chercher.
    const manquants = attendus.filter((cle) => !presents.includes(cle));
    expect(
      manquants,
      `Composants PrimeNG montés sans jetons — ils se rendraient sans style. ` +
        `Ajoute ${manquants.join(', ')} à COMPOSANTS_UTILISES dans aquabill-preset.ts.`,
    ).toEqual([]);
  });

  it('ne trouve pas les modules PrimeNG par accident', () => {
    // Garde-fou du garde-fou : si la détection cassait (renommage, changement
    // de convention d'import), le test précédent passerait sur une liste vide
    // et ne protégerait plus rien.
    expect(modulesPrimeNgUtilises().length).toBeGreaterThan(5);
  });

  it('reste nettement plus léger que le préréglage Aura complet', () => {
    // Aura porte 88 composants. Si ce nombre remonte vers 88, l'élagage a été
    // défait et les 74 kB sont revenus.
    expect(Object.keys(AquaBillPreset.components ?? {}).length).toBeLessThan(25);
  });
});
