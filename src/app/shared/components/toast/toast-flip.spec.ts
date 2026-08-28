import { calculerReplacements, memoriserPositions, PositionToast } from './toast-flip';

/**
 * Le replacement des toasts qui n'ont pas changé.
 *
 * La pile est une colonne flex : un nouveau toast s'insère en tête et pousse les
 * autres vers le bas, un toast qui disparaît laisse remonter ceux qui le
 * suivent. Aucune transition CSS ne s'applique à un déplacement causé par la
 * mise en page — ils sautaient, ce qui se lit comme un défaut d'affichage plutôt
 * que comme un changement.
 *
 * Ce que ces tests couvrent est le calcul : qui bouge, de combien, et qui doit
 * être laissé tranquille. C'est la partie qui porte des décisions. L'écriture
 * dans le DOM qui en découle est mécanique.
 */
function p(id: string, haut: number): PositionToast {
  return { id, haut };
}

describe('replacement des toasts', () => {
  it('un toast sans position antérieure est laissé à sa propre entrée', () => {
    // Lui inventer une ancienne position le ferait surgir en glissant depuis un
    // point arbitraire.
    const r = calculerReplacements(new Map(), [p('a', 20)]);
    expect(r).toEqual([]);
  });

  it('un toast poussé vers le bas repart de son ancienne place', () => {
    const avant = new Map([['a', 20]]);
    // Un nouveau s'est inséré en tête : « a » est descendu de 20 à 90.
    const r = calculerReplacements(avant, [p('b', 20), p('a', 90)]);
    // Il doit repartir 70 px plus haut, là où il était.
    expect(r).toEqual([{ id: 'a', ecart: -70 }]);
  });

  it('un toast qui remonte repart de plus bas', () => {
    const avant = new Map([['b', 90]]);
    // Celui du dessus a disparu : « b » remonte de 90 à 20.
    const r = calculerReplacements(avant, [p('b', 20)]);
    expect(r).toEqual([{ id: 'b', ecart: 70 }]);
  });

  it('un toast immobile n’est pas touché', () => {
    const avant = new Map([['a', 20]]);
    expect(calculerReplacements(avant, [p('a', 20)])).toEqual([]);
  });

  it('un déplacement sous le pixel est ignoré', () => {
    // Animer l'imperceptible ne fait qu'occuper le compositeur à chaque rendu.
    const avant = new Map([['a', 20]]);
    expect(calculerReplacements(avant, [p('a', 20.4)])).toEqual([]);
  });

  it('plusieurs toasts se replacent chacun de son écart', () => {
    const avant = new Map([['a', 20], ['b', 90]]);
    const r = calculerReplacements(avant, [p('neuf', 20), p('a', 90), p('b', 160)]);
    expect(r).toEqual([
      { id: 'a', ecart: -70 },
      { id: 'b', ecart: -70 },
    ]);
  });

  it('le nouveau venu au milieu d’un lot reste hors du calcul', () => {
    const avant = new Map([['a', 20]]);
    const r = calculerReplacements(avant, [p('neuf', 20), p('a', 90)]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('un toast disparu ne produit aucun replacement', () => {
    const avant = new Map([['a', 20], ['b', 90]]);
    const r = calculerReplacements(avant, [p('b', 20)]);
    expect(r).toEqual([{ id: 'b', ecart: 70 }]);
  });
});

describe('mémoire des positions', () => {
  it('retient le relevé courant', () => {
    const table = new Map<string, number>();
    memoriserPositions(table, [p('a', 20), p('b', 90)]);
    expect([...table.entries()]).toEqual([['a', 20], ['b', 90]]);
  });

  it('oublie les toasts disparus', () => {
    // Sur une session longue, les garder ferait grossir la table sans fin — et
    // un identifiant réutilisé hériterait d'une place qui n'a plus de sens.
    const table = new Map([['a', 20], ['b', 90]]);
    memoriserPositions(table, [p('b', 20)]);
    expect([...table.keys()]).toEqual(['b']);
    expect(table.get('b')).toBe(20);
  });

  it('se vide quand la pile se vide', () => {
    const table = new Map([['a', 20]]);
    memoriserPositions(table, []);
    expect(table.size).toBe(0);
  });
});

describe('un cycle complet', () => {
  it('trois toasts qui arrivent puis disparaissent ne sautent jamais', () => {
    const table = new Map<string, number>();

    // Premier : rien à replacer.
    let mesures = [p('a', 20)];
    expect(calculerReplacements(table, mesures)).toEqual([]);
    memoriserPositions(table, mesures);

    // Deuxième en tête : « a » descend.
    mesures = [p('b', 20), p('a', 90)];
    expect(calculerReplacements(table, mesures)).toEqual([{ id: 'a', ecart: -70 }]);
    memoriserPositions(table, mesures);

    // Troisième en tête : les deux descendent.
    mesures = [p('c', 20), p('b', 90), p('a', 160)];
    expect(calculerReplacements(table, mesures)).toEqual([
      { id: 'b', ecart: -70 },
      { id: 'a', ecart: -70 },
    ]);
    memoriserPositions(table, mesures);

    // « c » se ferme : les deux autres remontent.
    mesures = [p('b', 20), p('a', 90)];
    expect(calculerReplacements(table, mesures)).toEqual([
      { id: 'b', ecart: 70 },
      { id: 'a', ecart: 70 },
    ]);
    memoriserPositions(table, mesures);

    expect([...table.keys()]).toEqual(['b', 'a']);
  });
});
