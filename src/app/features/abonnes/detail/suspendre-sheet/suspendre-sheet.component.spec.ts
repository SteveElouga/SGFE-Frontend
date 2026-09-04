import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { SuspendreSheetComponent } from './suspendre-sheet.component';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCible, AbonneLigne } from '../../../../graphql/vues';

/**
 * Suspendre un abonné coupe son accès à l'eau. Réversible (contrairement à
 * la résiliation), sans checkbox de confirmation — le seul garde-fou côté
 * composant est de ne pas partir deux fois et de ne rien faire sans abonné
 * ciblé. `suspendreAbonne` renvoie `AbonneListFields` (cf. `AbonneLigne`).
 */
function abonneCible(p: Partial<AbonneCible> = {}): AbonneCible {
  return { id: 'a-1', nom: 'Diallo', prenom: 'Amadou', ...p };
}

function abonneSuspendu(p: Partial<AbonneLigne> = {}): AbonneLigne {
  return {
    id: 'a-1',
    numeroAbonne: 'AB-0001',
    nom: 'Diallo',
    prenom: 'Amadou',
    statut: 'SUSPENDU',
    compteur: { id: 'c-1', numeroCompteur: 42, quartier: 'Plateau', camp: 1, statut: 'ACTIF' },
    ...p,
  } as AbonneLigne;
}

describe('SuspendreSheetComponent', () => {
  function setup(over: Partial<{ a: AbonneCible | null }> = {}) {
    const suspendreAbonne = vi.fn().mockResolvedValue(abonneSuspendu());
    const success = vi.fn();
    const error = vi.fn();

    TestBed.configureTestingModule({
      imports: [SuspendreSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { suspendreAbonne } },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: { DETAIL: { SUSPENDRE_TITLE_NOM: "Suspendre l'abonné {{nom}} {{prenom}} ?" } },
      ERRORS: { GENERIC: 'Une erreur est survenue' },
    });
    translate.use('fr');

    const fixture = TestBed.createComponent(SuspendreSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, suspendreAbonne, success, error };
  }

  it('compose le titre avec le nom et le prénom de l’abonné ciblé', () => {
    const { c } = setup({ a: abonneCible({ nom: 'Koné', prenom: 'Mariam' }) });
    expect(c.title()).toBe("Suspendre l'abonné Koné Mariam ?");
  });

  it('rend un titre vide sans abonné ciblé', () => {
    const { c } = setup({ a: null });
    expect(c.title()).toBe('');
  });

  it('ne fait rien sans abonné ciblé', async () => {
    const { c, suspendreAbonne } = setup({ a: null });
    await c.confirm();
    expect(suspendreAbonne).not.toHaveBeenCalled();
  });

  it('suspend avec l’identifiant exact de l’abonné ciblé', async () => {
    const { c, suspendreAbonne } = setup({ a: abonneCible({ id: 'a-42' }) });
    await c.confirm();
    expect(suspendreAbonne).toHaveBeenCalledWith('a-42');
    expect(suspendreAbonne).toHaveBeenCalledTimes(1);
  });

  it('ne repart pas si une suspension est déjà en vol', async () => {
    const { c, suspendreAbonne } = setup();
    c.loading.set(true);
    await c.confirm();
    expect(suspendreAbonne).not.toHaveBeenCalled();
  });

  it('passe loading à true pendant l’appel puis à false au succès', async () => {
    const { c } = setup();
    const promesse = c.confirm();
    expect(c.loading()).toBe(true);
    await promesse;
    expect(c.loading()).toBe(false);
  });

  it('émet le nouveau statut renvoyé par le serveur', async () => {
    const { c } = setup();
    const recu: string[] = [];
    c.saved.subscribe((s) => recu.push(s));
    await c.confirm();
    expect(recu).toEqual(['SUSPENDU']);
  });

  it('affiche le message d’erreur du serveur et relève le verrou en cas d’échec', async () => {
    const { c, suspendreAbonne, error } = setup();
    suspendreAbonne.mockRejectedValueOnce(new Error('Seul un abonné actif peut être suspendu.'));
    const recu: string[] = [];
    c.saved.subscribe((s) => recu.push(s));

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Seul un abonné actif peut être suspendu.');
    expect(recu).toHaveLength(0);
    expect(c.loading()).toBe(false);
  });

  it('retombe sur le message générique quand l’erreur serveur est vide', async () => {
    const { c, suspendreAbonne, error } = setup();
    suspendreAbonne.mockRejectedValueOnce(new Error(''));

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Une erreur est survenue');
  });
});

/**
 * Ce que la feuille montre : bascule visuelle de l'état loading (boutons
 * désactivés, libellé qui change) — la seule protection visible puisqu'il
 * n'y a ni motif ni case à cocher pour cette action réversible.
 */
describe('SuspendreSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{ a: AbonneCible | null; suspendreAbonne: ReturnType<typeof vi.fn> }> = {}) {
    const suspendreAbonne = over.suspendreAbonne ?? vi.fn().mockResolvedValue(abonneSuspendu());

    TestBed.configureTestingModule({
      imports: [SuspendreSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { suspendreAbonne } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(SuspendreSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      texte: () => racine.textContent ?? '',
      confirmer: () =>
        [...racine.querySelectorAll('button')].find((b) =>
          b.classList.contains('dialog-btn--warning'),
        ) as HTMLButtonElement,
      annuler: () =>
        [...racine.querySelectorAll('button')].find((b) =>
          b.classList.contains('dialog-btn--ghost'),
        ) as HTMLButtonElement,
    };
  }

  it('affiche le nom de l’abonné dans le titre', () => {
    const { texte } = monter({ a: abonneCible({ nom: 'Traoré', prenom: 'Seydou' }) });
    expect(texte()).toContain('Traoré');
    expect(texte()).toContain('Seydou');
  });

  it('le bouton de confirmation est actif dès l’ouverture', () => {
    const { confirmer } = monter();
    expect(confirmer().disabled).toBe(false);
  });

  it('le bouton "annuler" émet close sans appeler le service', () => {
    const { annuler, c } = monter();
    const fermetures: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    annuler().click();
    expect(fermetures).toHaveLength(1);
  });

  it('désactive les deux boutons, pose aria-busy et change le libellé pendant la suspension', async () => {
    let resoudre!: (v: AbonneLigne) => void;
    const suspendreAbonne = vi.fn(
      () => new Promise<AbonneLigne>((r) => { resoudre = r; }),
    );
    const { fixture, confirmer, annuler, texte } = monter({ suspendreAbonne });

    confirmer().click();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(true);
    expect(confirmer().getAttribute('aria-busy')).toBe('true');
    expect(annuler().disabled).toBe(true);
    expect(texte()).toContain('Suspension…');

    resoudre(abonneSuspendu());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(false);
    expect(confirmer().getAttribute('aria-busy')).toBe('false');
    expect(texte()).toContain("Suspendre l'abonné");
  });

  it('rappelle que l’action reste réversible', () => {
    const { texte } = monter();
    expect(texte()).toMatch(/réversible|réactiv/i);
  });
});
