import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BottomSheetComponent } from './bottom-sheet.component';

/**
 * La poignée d'une feuille est une promesse : sur un téléphone, un trait
 * arrondi en haut d'un panneau annonce qu'on peut le tirer. Elle était dessinée
 * et ne servait à rien — le premier geste de quelqu'un qui veut fermer ne
 * produisait rien, ce qui se lit comme une panne avant de se lire comme une
 * fonctionnalité absente.
 *
 * Ces tests fixent les trois décisions du geste : ce qui ferme sur la distance,
 * ce qui ferme sur l'élan, et ce qui ne ferme pas.
 */
@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet [open]="ouverte()" ariaLabel="Test" (close)="fermetures.set(fermetures() + 1)">
      <button type="button">Contenu</button>
    </app-bottom-sheet>
  `,
})
class HoteTest {
  readonly ouverte = signal(true);
  readonly fermetures = signal(0);
}

describe('BottomSheetComponent · glisser pour fermer', () => {
  function setup(largeur = 390) {
    // Le geste n'existe qu'en mobile : au-delà de 1024 px la feuille est un
    // dialog centré, que tirer vers le bas n'aurait aucun sens.
    //
    // jsdom, tel que configuré par le runner, ne fournit pas `matchMedia` — on
    // l'installe plutôt que de l'espionner, faute de fonction à remplacer.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) =>
        ({
          matches: q.includes('max-width: 1023px') ? largeur <= 1023 : false,
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });

    TestBed.configureTestingModule({ imports: [HoteTest] });
    const fixture = TestBed.createComponent(HoteTest);
    fixture.detectChanges();

    const hote = fixture.componentInstance;
    const racine = fixture.nativeElement as HTMLElement;
    const poignee = racine.querySelector('.bs-sheet__poignee') as HTMLElement;
    const panneau = racine.querySelector('.bs-sheet') as HTMLElement;

    const env = (type: string, y: number, t: number) => {
      const ev = new PointerEvent(type, { pointerId: 1, clientY: y, bubbles: true });
      Object.defineProperty(ev, 'timeStamp', { value: t });
      poignee.dispatchEvent(ev);
    };

    const glisser = (de: number, vers: number, duree: number) => {
      env('pointerdown', de, 0);
      env('pointermove', vers, duree);
      env('pointerup', vers, duree);
    };

    return { fixture, hote, poignee, panneau, env, glisser };
  }

  it('la poignée existe et porte une zone de préhension', () => {
    const { poignee } = setup();
    expect(poignee).toBeTruthy();
  });

  it('suit le doigt vers le bas, au pixel près', () => {
    const { env, panneau } = setup();
    env('pointerdown', 100, 0);
    env('pointermove', 160, 50);
    expect(panneau.style.transform).toBe('translate(-50%, 60px)');
  });

  it('amortit le glissement vers le haut au lieu de buter', () => {
    const { env, panneau } = setup();
    env('pointerdown', 100, 0);
    env('pointermove', 60, 50); // 40 px vers le haut
    // Un quart du mouvement : la feuille cède un peu, sans partir.
    expect(panneau.style.transform).toBe('translate(-50%, -10px)');
  });

  it('ferme sur la distance, même sans élan', () => {
    const { hote, glisser } = setup();
    glisser(100, 240, 900); // 140 px, lentement
    expect(hote.fermetures()).toBe(1);
  });

  it('ferme sur l’élan, même sans distance', () => {
    const { hote, glisser } = setup();
    glisser(100, 140, 120); // 40 px, mais vivement
    expect(hote.fermetures()).toBe(1);
  });

  it('ne ferme pas sur une hésitation', () => {
    const { hote, glisser } = setup();
    glisser(100, 150, 2000); // 50 px en deux secondes : ni l'un ni l'autre
    expect(hote.fermetures()).toBe(0);
  });

  it('ne ferme pas quand le doigt revient sur ses pas', () => {
    const { hote, env } = setup();
    env('pointerdown', 100, 0);
    env('pointermove', 200, 50);
    env('pointermove', 90, 90); // remonté au-dessus du départ
    env('pointerup', 90, 90);
    expect(hote.fermetures()).toBe(0);
  });

  it('rend sa transition au panneau une fois le doigt levé', () => {
    const { env, panneau } = setup();
    env('pointerdown', 100, 0);
    env('pointermove', 130, 50);
    expect(panneau.style.transition).toBe('none');
    env('pointerup', 130, 50);
    expect(panneau.style.transition).toBe('');
    expect(panneau.style.transform).toBe('');
  });

  it('ignore un second doigt survenu en cours de geste', () => {
    const { poignee, panneau } = setup();
    const env = (type: string, id: number, y: number, t: number) => {
      const ev = new PointerEvent(type, { pointerId: id, clientY: y, bubbles: true });
      Object.defineProperty(ev, 'timeStamp', { value: t });
      poignee.dispatchEvent(ev);
    };
    env('pointerdown', 1, 100, 0);
    env('pointermove', 1, 150, 40);
    env('pointerdown', 2, 400, 50); // un autre doigt se pose loin
    env('pointermove', 2, 500, 60); // et bouge
    // La feuille suit toujours le premier doigt, pas le second.
    expect(panneau.style.transform).toBe('translate(-50%, 50px)');
  });

  it('ne glisse pas en desktop — la feuille y est un dialog centré', () => {
    const { hote, glisser, panneau } = setup(1440);
    glisser(100, 300, 200);
    expect(panneau.style.transform).toBe('');
    expect(hote.fermetures()).toBe(0);
  });

  it('Échap ferme toujours', () => {
    const { hote } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hote.fermetures()).toBe(1);
  });
});

/** Sans `ariaLabel` ni `labelledBy` : la feuille s'ouvre sans nom accessible. */
@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet [open]="ouverte()">
      <button type="button">Contenu</button>
    </app-bottom-sheet>
  `,
})
class HoteSansNomTest {
  readonly ouverte = signal(true);
}

/** Bouton hors de la feuille, pour vérifier la restauration du focus à la fermeture. */
@Component({
  imports: [BottomSheetComponent],
  template: `
    <button type="button" id="exterieur">Dehors</button>
    <app-bottom-sheet [open]="ouverte()" ariaLabel="Test" (close)="fermetures.set(fermetures() + 1)">
      <button type="button" id="premier">Premier</button>
      <button type="button" id="second">Second</button>
    </app-bottom-sheet>
  `,
})
class HoteFocusTrapTest {
  readonly ouverte = signal(false);
  readonly fermetures = signal(0);
}

/** Laisse tourner les micro-tâches en attente (le `queueMicrotask(focusFirst)` de l'effet d'ouverture). */
async function laisserPasserLesMicrotaches(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('BottomSheetComponent · garde-fou d’accessibilité (nom manquant)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avertit en console quand la feuille s’ouvre sans ariaLabel ni labelledBy', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    TestBed.configureTestingModule({ imports: [HoteSansNomTest] });
    const fixture = TestBed.createComponent(HoteSansNomTest);
    fixture.detectChanges();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ouverte sans nom accessible'),
    );
  });

  it('ne dit rien quand un ariaLabel est fourni (cas nominal des autres tests)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    TestBed.configureTestingModule({ imports: [HoteTest] });
    const fixture = TestBed.createComponent(HoteTest);
    fixture.detectChanges();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('BottomSheetComponent · piège de focus (Tab / Shift+Tab)', () => {
  function monterAvecFocusables() {
    TestBed.configureTestingModule({ imports: [HoteFocusTrapTest] });
    const fixture = TestBed.createComponent(HoteFocusTrapTest);
    const racine = fixture.nativeElement as HTMLElement;
    document.body.appendChild(racine);
    fixture.componentInstance.ouverte.set(true); // le piège de focus n'agit que sheet ouverte
    fixture.detectChanges();

    const premier = racine.querySelector('#premier') as HTMLElement;
    const second = racine.querySelector('#second') as HTMLElement;
    // jsdom ne calcule aucune mise en page : `offsetParent` y vaut toujours
    // `null`. `getFocusables()` s'appuie dessus pour ignorer les éléments
    // masqués — on le force ici pour simuler des boutons réellement visibles.
    for (const el of [premier, second]) {
      Object.defineProperty(el, 'offsetParent', { configurable: true, get: () => document.body });
    }

    return { fixture, hote: fixture.componentInstance, racine, premier, second };
  }

  afterEach(() => {
    document.querySelectorAll('body > *').forEach((el) => el.remove());
  });

  it('Tab depuis le dernier élément revient au premier', () => {
    const { premier, second } = monterAvecFocusables();
    second.focus();
    expect(document.activeElement).toBe(second);

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);

    expect(document.activeElement).toBe(premier);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Maj+Tab depuis le premier élément revient au dernier', () => {
    const { premier, second } = monterAvecFocusables();
    premier.focus();
    expect(document.activeElement).toBe(premier);

    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);

    expect(document.activeElement).toBe(second);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Tab ne fait rien tant que la feuille est fermée', () => {
    TestBed.configureTestingModule({ imports: [HoteFocusTrapTest] });
    const fixture = TestBed.createComponent(HoteFocusTrapTest); // ouverte() = false par défaut
    const racine = fixture.nativeElement as HTMLElement;
    document.body.appendChild(racine);
    fixture.detectChanges();
    const premier = racine.querySelector('#premier') as HTMLElement;
    premier.focus();

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);

    // Sheet fermée : le piège de focus est inactif, rien n'est intercepté.
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(premier);
  });

  it('Tab ne boucle pas quand le focus n’est pas sur le dernier élément', () => {
    const { premier, second } = monterAvecFocusables();
    premier.focus();

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);

    // Le focus n'était pas sur le dernier élément : onTab ne fait rien, le
    // navigateur gère lui-même la tabulation normale.
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(premier);
    void second;
  });

  it('restaure le focus sur l’élément déclencheur à la fermeture de la feuille', async () => {
    TestBed.configureTestingModule({ imports: [HoteFocusTrapTest] });
    const fixture = TestBed.createComponent(HoteFocusTrapTest);
    const racine = fixture.nativeElement as HTMLElement;
    document.body.appendChild(racine);
    fixture.detectChanges();

    const exterieur = racine.querySelector('#exterieur') as HTMLElement;
    exterieur.focus();
    expect(document.activeElement).toBe(exterieur);

    fixture.componentInstance.ouverte.set(true);
    fixture.detectChanges();
    await laisserPasserLesMicrotaches();

    fixture.componentInstance.ouverte.set(false);
    fixture.detectChanges();
    await laisserPasserLesMicrotaches();

    expect(document.activeElement).toBe(exterieur);
  });
});
