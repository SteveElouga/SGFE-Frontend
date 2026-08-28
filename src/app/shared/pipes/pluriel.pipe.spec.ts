import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { PlurielPipe } from './pluriel.pipe';

/**
 * Ces trois premiers cas viennent de `espace-abonne`, qui portait sa propre
 * fonction `pluriel()` avec sa propre convention (`_UN` / `_UNE`). Ils suivent
 * le pipe qui l'a remplacée : le comportement change de maison, pas de sens.
 *
 * Les suivants couvrent ce que la fonction locale ne faisait pas — la forme
 * dédiée à zéro, et le repli sur la clé de base pour un libellé pas encore
 * migré.
 */
describe('PlurielPipe', () => {
  function pipe(traductions: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }), PlurielPipe],
    });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('fr', traductions);
    t.use('fr');
    return TestBed.inject(PlurielPipe);
  }

  const COMPLET = {
    X_ZERO: 'aucun',
    X_SINGULAR: 'un seul',
    X_PLURAL: '{{n}} en tout',
  };

  it('passe au singulier à un', () => {
    expect(pipe(COMPLET).transform('X', 1)).toBe('un seul');
  });

  it('passe au pluriel au-delà, et sert le paramètre', () => {
    // Un seul appel à `pipe()` par test : `TestBed` ne se reconfigure pas une
    // fois instancié.
    const p = pipe(COMPLET);
    expect(p.transform('X', 2, { n: 2 })).toBe('2 en tout');
    expect(p.transform('X', 62, { n: 62 })).toBe('62 en tout');
  });

  it('zéro a sa propre forme : « 0 facture » se lit comme un décompte, pas comme un état', () => {
    expect(pipe(COMPLET).transform('X', 0)).toBe('aucun');
  });

  it('zéro retombe sur le pluriel quand aucune forme ne lui est dédiée', () => {
    const p = pipe({ X_SINGULAR: 'un seul', X_PLURAL: '{{n}} en tout' });
    expect(p.transform('X', 0, { n: 0 })).toBe('0 en tout');
  });

  it('sert la clé de base tant qu’un libellé n’a pas ses variantes', () => {
    // C'est ce qui rend la migration possible libellé par libellé : un appel au
    // pipe sur une clé non encore déclinée continue de rendre le texte existant.
    const p = pipe({ X: 'texte inchangé' });
    expect(p.transform('X', 1)).toBe('texte inchangé');
    expect(p.transform('X', 7)).toBe('texte inchangé');
  });
});
