import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { ReactiverSheetComponent } from './reactiver-sheet.component';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCible, AbonneLigne } from '../../../../graphql/vues';

/**
 * Réactiver un abonné suspendu lui redonne l'accès à l'eau et le réinscrit
 * dans les prochaines campagnes de relevé. Contrairement aux autres sheets
 * ADMIN de cet écran, il n'y a ici ni motif ni confirmation textuelle à
 * saisir : le seul garde-fou est de ne pas partir deux fois (double-clic) et
 * de ne rien faire sans abonné ciblé.
 *
 * `reactiverAbonne` renvoie `AbonneListFields` (même sélection que la liste,
 * cf. `AbonneLigne`) — pas le modèle `Abonne` complet.
 */
function abonneCible(p: Partial<AbonneCible> = {}): AbonneCible {
  return { id: 'a-1', nom: 'Diallo', prenom: 'Amadou', ...p };
}

function abonneReactive(p: Partial<AbonneLigne> = {}): AbonneLigne {
  return {
    id: 'a-1',
    numeroAbonne: 'AB-0001',
    nom: 'Diallo',
    prenom: 'Amadou',
    statut: 'ACTIF',
    compteur: { id: 'c-1', numeroCompteur: 42, quartier: 'Plateau', camp: 1, statut: 'ACTIF' },
    ...p,
  } as AbonneLigne;
}

describe('ReactiverSheetComponent', () => {
  function setup(over: Partial<{ a: AbonneCible | null }> = {}) {
    const reactiverAbonne = vi.fn().mockResolvedValue(abonneReactive());
    const success = vi.fn();
    const error = vi.fn();

    TestBed.configureTestingModule({
      imports: [ReactiverSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { reactiverAbonne } },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: { DETAIL: { REACTIV_TITLE_NOM: "Réactiver l'abonné {{nom}} {{prenom}} ?" } },
      ERRORS: { GENERIC: 'Une erreur est survenue' },
    });
    translate.use('fr');

    const fixture = TestBed.createComponent(ReactiverSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, reactiverAbonne, success, error };
  }

  it('compose le titre avec le nom et le prénom de l’abonné ciblé', () => {
    const { c } = setup({ a: abonneCible({ nom: 'Koné', prenom: 'Mariam' }) });
    expect(c.title()).toBe("Réactiver l'abonné Koné Mariam ?");
  });

  it('rend un titre vide sans abonné ciblé', () => {
    const { c } = setup({ a: null });
    expect(c.title()).toBe('');
  });

  it('ne fait rien sans abonné ciblé, même sur un clic', async () => {
    const { c, reactiverAbonne } = setup({ a: null });
    await c.confirm();
    expect(reactiverAbonne).not.toHaveBeenCalled();
  });

  it('réactive avec l’identifiant exact de l’abonné ciblé', async () => {
    const { c, reactiverAbonne } = setup({ a: abonneCible({ id: 'a-42' }) });
    await c.confirm();
    expect(reactiverAbonne).toHaveBeenCalledWith('a-42');
    expect(reactiverAbonne).toHaveBeenCalledTimes(1);
  });

  it('ne repart pas si une réactivation est déjà en vol', async () => {
    const { c, reactiverAbonne } = setup();
    c.loading.set(true);
    await c.confirm();
    expect(reactiverAbonne).not.toHaveBeenCalled();
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
    expect(recu).toEqual(['ACTIF']);
  });

  it('affiche le message d’erreur du serveur et relève le verrou en cas d’échec', async () => {
    const { c, reactiverAbonne, error } = setup();
    reactiverAbonne.mockRejectedValueOnce(new Error('Seul un abonné suspendu peut être réactivé.'));
    const recu: string[] = [];
    c.saved.subscribe((s) => recu.push(s));

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Seul un abonné suspendu peut être réactivé.');
    expect(recu).toHaveLength(0);
    expect(c.loading()).toBe(false);
  });

  it('retombe sur le message générique quand l’erreur serveur est vide', async () => {
    const { c, reactiverAbonne, error } = setup();
    reactiverAbonne.mockRejectedValueOnce(new Error(''));

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Une erreur est survenue');
  });
});

/**
 * Ce que la feuille montre : le bouton de confirmation doit se désactiver
 * pendant la réactivation (pas de double-clic possible côté DOM), et le
 * texte affiché doit refléter l'état loading.
 */
describe('ReactiverSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{ a: AbonneCible | null; reactiverAbonne: ReturnType<typeof vi.fn> }> = {}) {
    const reactiverAbonne = over.reactiverAbonne ?? vi.fn().mockResolvedValue(abonneReactive());

    TestBed.configureTestingModule({
      imports: [ReactiverSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { reactiverAbonne } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(ReactiverSheetComponent);
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
          b.classList.contains('dialog-btn--success'),
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

  it('le bouton de confirmation est actif dès l’ouverture — aucune saisie requise', () => {
    const { confirmer } = monter();
    expect(confirmer().disabled).toBe(false);
  });

  it('le bouton "annuler" émet close sans appeler le service', () => {
    const { annuler, c, racine } = monter();
    const fermetures: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    annuler().click();
    expect(fermetures).toHaveLength(1);
  });

  it('désactive les deux boutons et change le libellé pendant la réactivation', async () => {
    let resoudre!: (v: AbonneLigne) => void;
    const reactiverAbonne = vi.fn(
      () => new Promise<AbonneLigne>((r) => { resoudre = r; }),
    );
    const { fixture, confirmer, annuler, texte } = monter({ reactiverAbonne });

    confirmer().click();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(true);
    expect(annuler().disabled).toBe(true);
    expect(texte()).toContain('Réactivation…');

    resoudre(abonneReactive());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(false);
    expect(texte()).toContain("Réactiver l'abonné");
  });
});
