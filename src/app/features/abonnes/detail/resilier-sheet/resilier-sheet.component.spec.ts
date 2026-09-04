import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { ResilierSheetComponent } from './resilier-sheet.component';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCibleCompteur } from '../../../../graphql/vues';
import type { StatutAbonne } from '../../../../shared/models/abonne.model';

/**
 * Résilier un abonné est définitif : le garde-fou est une checkbox
 * explicite (« je comprends que cette action est définitive »), qui doit se
 * décocher à chaque réouverture de la feuille — sinon un clic un peu vif sur
 * un abonné mal choisi résilie sans confirmation la fois suivante.
 */
function abonneCible(p: Partial<AbonneCibleCompteur> = {}): AbonneCibleCompteur {
  return {
    id: 'a-1',
    nom: 'Diallo',
    prenom: 'Amadou',
    numeroAbonne: 'AB-0001',
    compteur: {
      id: 'c-1',
      numeroCompteur: 42,
      quartier: 'Plateau',
      camp: 1,
      datePose: '2024-01-10',
      position: 'Devant portail',
    },
    ...p,
  };
}

function resultatResiliation(statut: StatutAbonne = 'RESILIE'): { id: string; statut: StatutAbonne } {
  return { id: 'a-1', statut };
}

describe('ResilierSheetComponent', () => {
  function setup(over: Partial<{ a: AbonneCibleCompteur | null }> = {}) {
    const resilierAbonne = vi.fn().mockResolvedValue(resultatResiliation());
    const success = vi.fn();
    const error = vi.fn();

    TestBed.configureTestingModule({
      imports: [ResilierSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { resilierAbonne } },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: {
        DETAIL: {
          RESILIATION_TITLE: "Résilier l'abonnement ?",
          RESIL_TITLE_NOM: "Résilier l'abonné {{nom}} {{prenom}} ?",
        },
      },
      ERRORS: { GENERIC: 'Une erreur est survenue' },
    });
    translate.use('fr');

    const fixture = TestBed.createComponent(ResilierSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, resilierAbonne, success, error };
  }

  // ── Titre et affichage du compteur ────────────────────────────────────────

  it('compose le titre avec le nom et le prénom de l’abonné ciblé', () => {
    const { c } = setup({ a: abonneCible({ nom: 'Koné', prenom: 'Mariam' }) });
    expect(c.title()).toBe("Résilier l'abonné Koné Mariam ?");
  });

  it('retombe sur un titre générique sans abonné ciblé — pas une chaîne vide', () => {
    const { c } = setup({ a: null });
    expect(c.title()).toBe("Résilier l'abonnement ?");
  });

  it('formate le numéro de compteur avec le préfixe C- et les zéros de tête', () => {
    const { c } = setup({ a: abonneCible({ compteur: { ...abonneCible().compteur!, numeroCompteur: 7 } }) });
    expect(c.compteurNumDisplay()).toBe('C-0007');
  });

  it('affiche un tiret quand l’abonné n’a pas de compteur', () => {
    const { c } = setup({ a: abonneCible({ compteur: null }) });
    expect(c.compteurNumDisplay()).toBe('—');
  });

  // ── Le garde-fou : la case à cocher ────────────────────────────────────────

  it('la case de confirmation est décochée par défaut', () => {
    const { c } = setup();
    expect(c.confirme()).toBe(false);
  });

  it('ne résilie pas tant que la case n’est pas cochée, même en appelant confirm()', async () => {
    const { c, resilierAbonne } = setup();
    await c.confirm();
    expect(resilierAbonne).not.toHaveBeenCalled();
  });

  it('résilie une fois la case cochée', async () => {
    const { c, resilierAbonne } = setup();
    c.confirme.set(true);
    await c.confirm();
    expect(resilierAbonne).toHaveBeenCalledWith('a-1');
  });

  it('ne fait rien sans abonné ciblé, même case cochée', async () => {
    const { c, resilierAbonne } = setup({ a: null });
    c.confirme.set(true);
    await c.confirm();
    expect(resilierAbonne).not.toHaveBeenCalled();
  });

  it('ne repart pas si une résiliation est déjà en vol', async () => {
    const { c, resilierAbonne } = setup();
    c.confirme.set(true);
    c.loading.set(true);
    await c.confirm();
    expect(resilierAbonne).not.toHaveBeenCalled();
  });

  it('décoche la confirmation à chaque réouverture de la feuille', () => {
    const { fixture, c } = setup();
    c.confirme.set(true);
    expect(c.confirme()).toBe(true);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(c.confirme()).toBe(true); // la fermeture seule ne décoche rien

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(c.confirme()).toBe(false); // la réouverture, si
  });

  // ── Résultat de la mutation ────────────────────────────────────────────────

  it('émet le nouveau statut renvoyé par le serveur', async () => {
    const { c } = setup();
    const recu: StatutAbonne[] = [];
    c.saved.subscribe((s) => recu.push(s));
    c.confirme.set(true);
    await c.confirm();
    expect(recu).toEqual(['RESILIE']);
  });

  it('passe loading à true pendant l’appel puis à false au succès', async () => {
    const { c } = setup();
    c.confirme.set(true);
    const promesse = c.confirm();
    expect(c.loading()).toBe(true);
    await promesse;
    expect(c.loading()).toBe(false);
  });

  it('affiche le message d’erreur du serveur et relève le verrou en cas d’échec', async () => {
    const { c, resilierAbonne, error } = setup();
    resilierAbonne.mockRejectedValueOnce(new Error('Un abonné avec un solde impayé ne peut pas être résilié.'));
    const recu: StatutAbonne[] = [];
    c.saved.subscribe((s) => recu.push(s));
    c.confirme.set(true);

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Un abonné avec un solde impayé ne peut pas être résilié.');
    expect(recu).toHaveLength(0);
    expect(c.loading()).toBe(false);
  });

  it('retombe sur le message générique quand l’erreur serveur est vide', async () => {
    const { c, resilierAbonne, error } = setup();
    resilierAbonne.mockRejectedValueOnce(new Error(''));
    c.confirme.set(true);

    await c.confirm();

    expect(error).toHaveBeenCalledWith('Une erreur est survenue');
  });
});

/**
 * Ce que la feuille montre : le bouton définitif reste désactivé tant que
 * la case n'est pas cochée à l'écran, pas seulement côté logique.
 */
describe('ResilierSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{ a: AbonneCibleCompteur | null; resilierAbonne: ReturnType<typeof vi.fn> }> = {}) {
    const resilierAbonne = over.resilierAbonne ?? vi.fn().mockResolvedValue(resultatResiliation());

    TestBed.configureTestingModule({
      imports: [ResilierSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { resilierAbonne } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(ResilierSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      texte: () => racine.textContent ?? '',
      checkbox: () => racine.querySelector('.resil-checkbox input[type="checkbox"]') as HTMLInputElement,
      confirmer: () =>
        [...racine.querySelectorAll('button')].find((b) =>
          b.classList.contains('dialog-btn--danger'),
        ) as HTMLButtonElement,
    };
  }

  it('le bouton définitif est désactivé tant que la case n’est pas cochée', () => {
    const { confirmer } = monter();
    expect(confirmer().disabled).toBe(true);
  });

  it('cocher la case active le bouton définitif', () => {
    const { fixture, checkbox, confirmer } = monter();
    checkbox().click();
    fixture.detectChanges();
    expect(checkbox().checked).toBe(true);
    expect(confirmer().disabled).toBe(false);
  });

  it('décocher de nouveau redésactive le bouton', () => {
    const { fixture, checkbox, confirmer } = monter();
    checkbox().click();
    fixture.detectChanges();
    checkbox().click();
    fixture.detectChanges();
    expect(confirmer().disabled).toBe(true);
  });

  it('le clic sur le bouton définitif appelle bien la résiliation, case cochée', async () => {
    const { fixture, checkbox, confirmer, c } = monter();
    checkbox().click();
    fixture.detectChanges();

    const recu: StatutAbonne[] = [];
    c.saved.subscribe((s) => recu.push(s));
    confirmer().click();
    await fixture.whenStable();

    expect(recu).toEqual(['RESILIE']);
  });

  it('affiche le numéro de compteur dans le libellé de la ligne récapitulative', () => {
    const { texte } = monter({ a: abonneCible({ compteur: { ...abonneCible().compteur!, numeroCompteur: 99 } }) });
    expect(texte()).toContain('C-0099');
  });

  it('prévient que l’action est irréversible', () => {
    const { texte } = monter();
    expect(texte()).toMatch(/irréversible|définitiv/i);
  });

  it('change le libellé du bouton pendant la résiliation', async () => {
    let resoudre!: (v: { id: string; statut: StatutAbonne }) => void;
    const resilierAbonne = vi.fn(
      () => new Promise<{ id: string; statut: StatutAbonne }>((r) => { resoudre = r; }),
    );
    const { fixture, checkbox, confirmer, texte } = monter({ resilierAbonne });
    checkbox().click();
    fixture.detectChanges();

    confirmer().click();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(true);
    expect(texte()).toContain('Résiliation…');

    resoudre(resultatResiliation());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texte()).toContain('Résilier définitivement');
  });
});
