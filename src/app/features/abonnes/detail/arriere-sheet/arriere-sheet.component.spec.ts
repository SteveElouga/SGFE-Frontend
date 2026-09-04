import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { ArriereSheetComponent } from './arriere-sheet.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCible } from '../../../../graphql/vues';

/**
 * Saisir un arriéré crée une vraie facture (de régularisation) là où il n'y
 * en avait aucune : une dette apparaît sans qu'aucun relevé ne la justifie.
 * Deux garde-fous : un montant strictement positif, et un motif d'au moins
 * trois caractères — la seule trace de la raison du montant déclaré.
 */
function abonneCible(p: Partial<AbonneCible> = {}): AbonneCible {
  return { id: 'a-1', nom: 'Diallo', prenom: 'Amadou', ...p };
}

function factureRegularisation(p: Partial<{ factureId: string; numeroFacture: string; montant: number }> = {}) {
  return { factureId: 'f-reg-1', numeroFacture: 'REG-2026-0001', montant: 15_000, ...p };
}

describe('ArriereSheetComponent', () => {
  function setup(over: Partial<{ a: AbonneCible | null }> = {}) {
    const creerRegularisation = vi.fn().mockResolvedValue(factureRegularisation());
    const success = vi.fn();
    const error = vi.fn();

    TestBed.configureTestingModule({
      imports: [ArriereSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { creerRegularisation } },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: { ARRIERE: { SUCCES: 'Arriéré {{numero}} enregistré' } },
      ERRORS: { GENERIC: 'Une erreur est survenue' },
    });
    translate.use('fr');

    const fixture = TestBed.createComponent(ArriereSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, creerRegularisation, success, error };
  }

  // ── Nom affiché ────────────────────────────────────────────────────────────

  it('compose le nom affiché en prénom puis nom', () => {
    const { c } = setup({ a: abonneCible({ nom: 'Koné', prenom: 'Mariam' }) });
    expect(c.nomComplet()).toBe('Mariam Koné');
  });

  it('rend une chaîne vide sans abonné ciblé', () => {
    const { c } = setup({ a: null });
    expect(c.nomComplet()).toBe('');
  });

  // ── Garde-fou : le montant ───────────────────────────────────────────────

  it('refuse un montant nul', () => {
    const { c } = setup();
    expect(c.montantValide()).toBe(false);
  });

  it('refuse un montant à zéro', () => {
    const { c } = setup();
    c.montant.set(0);
    expect(c.montantValide()).toBe(false);
  });

  it('refuse un montant négatif', () => {
    const { c } = setup();
    c.montant.set(-500);
    expect(c.montantValide()).toBe(false);
  });

  it('accepte un montant strictement positif', () => {
    const { c } = setup();
    c.montant.set(15_000);
    expect(c.montantValide()).toBe(true);
  });

  // ── Garde-fou : le motif ─────────────────────────────────────────────────

  it('refuse un motif vide', () => {
    const { c } = setup();
    expect(c.motifValide()).toBe(false);
  });

  it('refuse un motif de moins de trois caractères significatifs', () => {
    const { c } = setup();
    c.motif.set('ok');
    expect(c.motifValide()).toBe(false);
  });

  it('un motif fait uniquement d’espaces ne compte pas', () => {
    const { c } = setup();
    c.motif.set('     ');
    expect(c.motifValide()).toBe(false);
  });

  it('accepte un motif d’au moins trois caractères', () => {
    const { c } = setup();
    c.motif.set('Reprise historique');
    expect(c.motifValide()).toBe(true);
  });

  // ── Le formulaire complet ────────────────────────────────────────────────

  it('formValide exige le montant ET le motif', () => {
    const { c } = setup();
    expect(c.formValide()).toBe(false);
    c.montant.set(10_000);
    expect(c.formValide()).toBe(false); // montant seul ne suffit pas
    c.motif.set('ok');
    expect(c.formValide()).toBe(false); // motif trop court
    c.motif.set('Arriéré 2025');
    expect(c.formValide()).toBe(true);
  });

  // ── Récapitulatif ─────────────────────────────────────────────────────────

  it('ne récapitule rien tant que le montant est invalide', () => {
    const { c } = setup();
    expect(c.recap()).toBeNull();
    c.montant.set(0);
    expect(c.recap()).toBeNull();
  });

  it('récapitule le montant formaté en FCFA dès qu’il est valide', () => {
    const { c } = setup();
    c.montant.set(12_345);
    expect(c.recap()).toMatch(/12[\s ]?345 FCFA/);
  });

  // ── submit() : le geste qui crée la dette ─────────────────────────────────

  it('ne crée rien sans abonné ciblé, même formulaire rempli', async () => {
    const { c, creerRegularisation } = setup({ a: null });
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    await c.submit();
    expect(creerRegularisation).not.toHaveBeenCalled();
  });

  it('ne crée rien tant que le montant manque', async () => {
    const { c, creerRegularisation } = setup();
    c.motif.set('Arriéré 2025');
    await c.submit();
    expect(creerRegularisation).not.toHaveBeenCalled();
  });

  it('ne crée rien tant que le motif est trop court', async () => {
    const { c, creerRegularisation } = setup();
    c.montant.set(10_000);
    c.motif.set('x');
    await c.submit();
    expect(creerRegularisation).not.toHaveBeenCalled();
  });

  it('ne repart pas si une création est déjà en vol', async () => {
    const { c, creerRegularisation } = setup();
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    c.submitting.set(true);
    await c.submit();
    expect(creerRegularisation).not.toHaveBeenCalled();
  });

  it('envoie exactement abonneId, montant et motif nettoyé de ses espaces', async () => {
    const { c, creerRegularisation } = setup({ a: abonneCible({ id: 'a-42' }) });
    c.montant.set(25_000);
    c.motif.set('  Arriéré antérieur à la mise en service  ');
    await c.submit();
    expect(creerRegularisation).toHaveBeenCalledWith({
      abonneId: 'a-42',
      montant: 25_000,
      motif: 'Arriéré antérieur à la mise en service',
    });
  });

  it('passe submitting à true pendant l’appel puis à false au succès', async () => {
    const { c } = setup();
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    const promesse = c.submit();
    expect(c.submitting()).toBe(true);
    await promesse;
    expect(c.submitting()).toBe(false);
  });

  it('affiche un toast de succès avec le numéro de la facture créée', async () => {
    const { c, success, creerRegularisation } = setup();
    creerRegularisation.mockResolvedValueOnce(factureRegularisation({ numeroFacture: 'REG-2026-0007' }));
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    await c.submit();
    expect(success).toHaveBeenCalledWith('Arriéré REG-2026-0007 enregistré');
  });

  it('réinitialise le formulaire et referme la feuille au succès', async () => {
    const { c } = setup();
    const fermetures: void[] = [];
    const sauvegardes: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    c.saved.subscribe(() => sauvegardes.push(undefined));
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');

    await c.submit();

    expect(c.montant()).toBeNull();
    expect(c.motif()).toBe('');
    expect(fermetures).toHaveLength(1);
    expect(sauvegardes).toHaveLength(1);
  });

  it('affiche le message d’erreur du serveur et relève le verrou, sans fermer ni réinitialiser', async () => {
    const { c, creerRegularisation, error } = setup();
    creerRegularisation.mockRejectedValueOnce(new Error('Un arriéré existe déjà pour cet abonné.'));
    const fermetures: void[] = [];
    const sauvegardes: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    c.saved.subscribe(() => sauvegardes.push(undefined));
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');

    await c.submit();

    expect(error).toHaveBeenCalledWith('Un arriéré existe déjà pour cet abonné.');
    expect(c.submitting()).toBe(false);
    expect(fermetures).toHaveLength(0);
    expect(sauvegardes).toHaveLength(0);
    expect(c.montant()).toBe(10_000); // le formulaire n'est pas perdu après un échec
    expect(c.motif()).toBe('Arriéré 2025');
  });

  it('retombe sur le message générique quand l’erreur serveur est vide', async () => {
    const { c, creerRegularisation, error } = setup();
    creerRegularisation.mockRejectedValueOnce(new Error(''));
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');

    await c.submit();

    expect(error).toHaveBeenCalledWith('Une erreur est survenue');
  });

  // ── onClose() ────────────────────────────────────────────────────────────

  it('onClose réinitialise le formulaire même sans avoir validé', () => {
    const { c } = setup();
    c.montant.set(5_000);
    c.motif.set('Brouillon');
    const fermetures: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));

    c.onClose();

    expect(c.montant()).toBeNull();
    expect(c.motif()).toBe('');
    expect(fermetures).toHaveLength(1);
  });
});

/**
 * Ce que la feuille montre : le bouton de création reste désactivé tant
 * que montant et motif ne sont pas tous les deux valides, et le
 * récapitulatif n'apparaît qu'avec un montant renseigné.
 */
describe('ArriereSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{ a: AbonneCible | null; creerRegularisation: ReturnType<typeof vi.fn> }> = {}) {
    const creerRegularisation = over.creerRegularisation ?? vi.fn().mockResolvedValue(factureRegularisation());

    TestBed.configureTestingModule({
      imports: [ArriereSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { creerRegularisation } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(ArriereSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonneCible());
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      texte: () => racine.textContent ?? '',
      valider: () => racine.querySelector('.arr-btn--valider') as HTMLButtonElement,
      annuler: () => racine.querySelector('.arr-btn--annuler') as HTMLButtonElement,
      recap: () => racine.querySelector('.arr-recap'),
      montantInput: () => racine.querySelector('#arriere-montant') as HTMLInputElement,
      motifInput: () => racine.querySelector('#arriere-motif') as HTMLInputElement,
    };
  }

  it('le bouton de création est désactivé tant que le formulaire est incomplet', () => {
    const { valider } = monter();
    expect(valider().disabled).toBe(true);
  });

  it('le bouton s’active une fois montant et motif renseignés', () => {
    const { fixture, c, valider } = monter();
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    fixture.detectChanges();
    expect(valider().disabled).toBe(false);
  });

  it('n’affiche pas de récapitulatif sans montant', () => {
    const { recap } = monter();
    expect(recap()).toBeNull();
  });

  it('affiche le récapitulatif dès qu’un montant valide est saisi', () => {
    const { fixture, c, recap, texte } = monter();
    c.montant.set(20_000);
    fixture.detectChanges();
    expect(recap()).toBeTruthy();
    expect(texte()).toMatch(/20[\s ]?000 FCFA/);
  });

  it('les deux champs portent une étiquette accessible', () => {
    const { racine } = monter();
    expect(racine.querySelector('label[for="arriere-montant"]')).toBeTruthy();
    expect(racine.querySelector('label[for="arriere-motif"]')).toBeTruthy();
  });

  it('le nom de l’abonné apparaît dans la description', () => {
    const { texte } = monter({ a: abonneCible({ nom: 'Traoré', prenom: 'Seydou' }) });
    expect(texte()).toContain('Seydou Traoré');
  });

  it('le bouton "annuler" réinitialise le formulaire et ferme, sans appeler le service', () => {
    const creerRegularisation = vi.fn().mockResolvedValue(factureRegularisation());
    const { fixture, c, annuler } = monter({ creerRegularisation });
    c.montant.set(10_000);
    fixture.detectChanges();

    const fermetures: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    annuler().click();

    expect(fermetures).toHaveLength(1);
    expect(c.montant()).toBeNull();
    expect(creerRegularisation).not.toHaveBeenCalled();
  });

  it('affiche "Enregistrement" et désactive le bouton pendant la création', async () => {
    let resoudre!: (v: ReturnType<typeof factureRegularisation>) => void;
    const creerRegularisation = vi.fn(
      () => new Promise<ReturnType<typeof factureRegularisation>>((r) => { resoudre = r; }),
    );
    const { fixture, c, valider, texte } = monter({ creerRegularisation });
    c.montant.set(10_000);
    c.motif.set('Arriéré 2025');
    fixture.detectChanges();

    valider().click();
    fixture.detectChanges();

    expect(valider().disabled).toBe(true);
    expect(texte()).not.toContain('Créer la régularisation');

    resoudre(factureRegularisation());
    await fixture.whenStable();
    fixture.detectChanges();
  });
});
