import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { PaiementFormComponent } from './paiement-form.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { ToastService } from '../../services/toast.service';
import { toIsoDate } from '../../utils/date.utils';
import type { FactureCible } from '../../../graphql/vues';

/**
 * Formulaire de paiement — le composant de référence du projet pour la saisie
 * (`ngModel` + signal + validation en `computed()`). La particularité qu'il
 * porte seul : la fenêtre d'annulation de 5s à la Gmail Undo Send, parce que
 * le backend n'a pas de mutation `annulerPaiement` — mieux vaut attendre que
 * corriger après coup.
 */
function cible(p: Partial<FactureCible> = {}): FactureCible {
  return { factureId: 'f-1', abonneId: 'ab-1', ...p };
}

describe('PaiementFormComponent', () => {
  function setup(over: { facture?: FactureCible; solde?: number | null } = {}) {
    const enregistrerPaiement = vi.fn().mockResolvedValue(undefined);
    const toastInfo = vi.fn().mockReturnValue('toast-1');
    const toastDismiss = vi.fn();
    const toastError = vi.fn();

    TestBed.configureTestingModule({
      imports: [PaiementFormComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { enregistrerPaiement } },
        { provide: ToastService, useValue: { info: toastInfo, dismiss: toastDismiss, error: toastError, success: vi.fn() } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(PaiementFormComponent);
    fixture.componentRef.setInput('facture', over.facture ?? cible());
    if (over.solde !== undefined) fixture.componentRef.setInput('soldeRestant', over.solde);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, enregistrerPaiement, toastInfo, toastDismiss, toastError };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Préremplissage à l'ouverture ───────────────────────────────────────────

  it('préremplit le montant avec le solde restant, et la date du jour', () => {
    const { c } = setup({ solde: 7_500 });
    expect(c.pMontant()).toBe('7500');
    expect(c.pMode()).toBe('ESPECES');
    expect(c.pDate()).toBeInstanceOf(Date);
  });

  it('laisse le montant vide sans solde connu (chargement en cours)', () => {
    const { c } = setup({ solde: null });
    expect(c.pMontant()).toBe('');
  });

  it('laisse le montant vide quand le solde est déjà à zéro', () => {
    const { c } = setup({ solde: 0 });
    expect(c.pMontant()).toBe('');
  });

  it('préremplit après coup si le solde arrive une fois le composant monté', () => {
    const { fixture, c } = setup({ solde: null });
    expect(c.pMontant()).toBe('');
    fixture.componentRef.setInput('soldeRestant', 3_000);
    fixture.detectChanges();
    expect(c.pMontant()).toBe('3000');
  });

  it("ne remplace pas une saisie déjà en cours quand le solde arrive en retard", () => {
    const { fixture, c } = setup({ solde: null });
    c.pMontant.set('999'); // l'utilisateur a déjà tapé
    fixture.componentRef.setInput('soldeRestant', 3_000);
    fixture.detectChanges();
    expect(c.pMontant()).toBe('999'); // pas écrasé
  });

  it('réinitialise tous les champs quand la facture ciblée change', () => {
    const { fixture, c } = setup({ facture: cible({ factureId: 'f-1' }), solde: 5_000 });
    c.pRef.set('ancienne-ref');
    c.pMode.set('VIREMENT');

    fixture.componentRef.setInput('facture', cible({ factureId: 'f-2' }));
    fixture.componentRef.setInput('soldeRestant', 2_000);
    fixture.detectChanges();

    expect(c.pRef()).toBe('');
    expect(c.pMode()).toBe('ESPECES');
    expect(c.pMontant()).toBe('2000');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("n'exige la référence qu'en Mobile Money ou Virement", () => {
    const { c } = setup({ solde: 5_000 });
    expect(c.refRequired()).toBe(false);
    c.pMode.set('MOBILE_MONEY');
    expect(c.refRequired()).toBe(true);
    c.pMode.set('VIREMENT');
    expect(c.refRequired()).toBe(true);
  });

  it("le formulaire est invalide sans date même avec un montant correct", () => {
    const { c } = setup({ solde: 5_000 });
    c.pDate.set(null);
    expect(c.formValid()).toBe(false);
  });

  it('le formulaire est valide en espèces sans référence', () => {
    const { c } = setup({ solde: 5_000 });
    expect(c.formValid()).toBe(true);
  });

  it('le formulaire est invalide en Mobile Money sans référence', () => {
    const { c } = setup({ solde: 5_000 });
    c.pMode.set('MOBILE_MONEY');
    expect(c.formValid()).toBe(false);
    c.pRef.set('TXN-1');
    expect(c.formValid()).toBe(true);
  });

  it('un montant non numérique invalide le formulaire', () => {
    const { c } = setup({ solde: 5_000 });
    c.pMontant.set('abc');
    expect(c.formValid()).toBe(false);
  });

  // ── L'excédent, une capacité et non une erreur ────────────────────────────

  it("n'annonce aucun excédent quand le montant ne dépasse pas le solde", () => {
    const { c } = setup({ solde: 5_000 });
    c.pMontant.set('5000');
    expect(c.excedent()).toBe(0);
  });

  it('annonce l’excédent au-delà du solde restant', () => {
    const { c } = setup({ solde: 5_000 });
    c.pMontant.set('8000');
    expect(c.excedent()).toBe(3_000);
  });

  it('un montant illisible ne produit pas un excédent fantôme', () => {
    const { c } = setup({ solde: 5_000 });
    c.pMontant.set('');
    expect(c.excedent()).toBe(0);
  });

  // ── Libellé du bouton ──────────────────────────────────────────────────────

  it('propose un libellé neutre sans montant valide', () => {
    const { c } = setup({ solde: null });
    expect(c.confirmLabel()).toBe('Confirmer le paiement');
  });

  it('affiche le montant dans le libellé de confirmation', () => {
    const { c } = setup({ solde: 5_000 });
    // `toLocaleString('fr-FR')` sépare les milliers par une espace fine
    // insécable (U+202F) : composer l'attente évite de la taper à la main.
    expect(c.confirmLabel()).toContain((5_000).toLocaleString('fr-FR'));
    expect(c.confirmLabel()).toContain('FCFA');
  });

  // ── Identifiants des champs ────────────────────────────────────────────────

  it('les ids par défaut sont préfixés "pf"', () => {
    const { c } = setup({ solde: 5_000 });
    expect(c.montantId()).toBe('pf-montant');
    expect(c.refId()).toBe('pf-ref');
  });

  it('un préfixe personnalisé évite les collisions entre deux formulaires', () => {
    const { fixture, c } = setup({ solde: 5_000 });
    fixture.componentRef.setInput('idPrefix', 'sheet');
    fixture.detectChanges();
    expect(c.montantId()).toBe('sheet-montant');
    expect(c.dateId()).toBe('sheet-date');
  });

  // ── Soumission avec fenêtre d'annulation ──────────────────────────────────

  it('ne soumet rien si le formulaire est invalide', () => {
    vi.useFakeTimers();
    const { c, enregistrerPaiement, toastInfo } = setup({ solde: null }); // pMontant vide → invalide
    c.submit();
    vi.advanceTimersByTime(6_000);
    expect(toastInfo).not.toHaveBeenCalled();
    expect(enregistrerPaiement).not.toHaveBeenCalled();
  });

  it("n'appelle pas l'API tout de suite : ouvre la fenêtre d'annulation", () => {
    vi.useFakeTimers();
    const { c, enregistrerPaiement, toastInfo } = setup({ solde: 5_000 });
    c.submit();
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(enregistrerPaiement).not.toHaveBeenCalled();
    expect(c.submitting()).toBe(true);
  });

  it("enregistre réellement le paiement après les 5 secondes", async () => {
    vi.useFakeTimers();
    const { c, enregistrerPaiement } = setup({ solde: 5_000, facture: cible({ factureId: 'f-7', abonneId: 'ab-7' }) });
    c.pMode.set('VIREMENT');
    c.pRef.set('REF-99');
    const date = new Date(2026, 7, 20);
    c.pDate.set(date);

    c.submit();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(enregistrerPaiement).toHaveBeenCalledWith({
      factureId: 'f-7',
      abonneId: 'ab-7',
      montant: 5_000,
      datePaiement: toIsoDate(date),
      modePaiement: 'VIREMENT',
      referenceTransaction: 'REF-99',
    });
  });

  it("envoie la référence telle quelle, espaces compris (pas de trim ici)", () => {
    // Constat, pas une exigence : `actuallyEnregistrer` envoie
    // `this.pRef() || undefined` sans `.trim()`, contrairement à
    // `encaissement-sheet.submit()` qui trime la sienne. Incohérence mineure
    // entre les deux formulaires de paiement, à leur charge — pas un bug
    // bloquant, donc non corrigé ici, seulement documenté par ce test.
    vi.useFakeTimers();
    const { c, enregistrerPaiement } = setup({ solde: 5_000 });
    c.pMode.set('VIREMENT');
    c.pRef.set('  REF-99  ');
    c.submit();
    vi.advanceTimersByTime(5_000);
    expect(enregistrerPaiement.mock.calls[0][0].referenceTransaction).toBe('  REF-99  ');
  });

  it('émet saved une fois le paiement effectivement enregistré', async () => {
    vi.useFakeTimers();
    const { c } = setup({ solde: 5_000 });
    const recu: void[] = [];
    c.saved.subscribe(() => recu.push(undefined));

    c.submit();
    expect(recu).toHaveLength(0); // pas encore, on est dans la fenêtre d'annulation
    await vi.advanceTimersByTimeAsync(5_000);

    expect(recu).toHaveLength(1);
  });

  it("l'action Annuler du toast empêche tout appel réseau", async () => {
    vi.useFakeTimers();
    const { c, enregistrerPaiement, toastInfo, toastDismiss } = setup({ solde: 5_000 });
    c.submit();
    const annuler = toastInfo.mock.calls[0][2][0].handler as () => void;

    annuler();

    expect(toastDismiss).toHaveBeenCalledWith('toast-1');
    expect(c.submitting()).toBe(false);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(enregistrerPaiement).not.toHaveBeenCalled();
  });

  it("l'annulation affiche un toast confirmant que rien n'a été envoyé", () => {
    vi.useFakeTimers();
    const { c, toastInfo } = setup({ solde: 5_000 });
    c.submit();
    const annuler = toastInfo.mock.calls[0][2][0].handler as () => void;
    annuler();
    expect(toastInfo).toHaveBeenLastCalledWith('Paiement annulé');
  });

  it('un second submit pendant la fenêtre en cours ne relance rien', () => {
    vi.useFakeTimers();
    const { c, toastInfo } = setup({ solde: 5_000 });
    c.submit();
    c.submit();
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('affiche une erreur et réhabilite le formulaire quand la mutation échoue', async () => {
    vi.useFakeTimers();
    const enregistrerPaiement = vi.fn().mockRejectedValue(new Error('Le serveur est indisponible'));
    TestBed.configureTestingModule({
      imports: [PaiementFormComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { enregistrerPaiement } },
        { provide: ToastService, useValue: { info: vi.fn().mockReturnValue('t-1'), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');
    const fixture = TestBed.createComponent(PaiementFormComponent);
    fixture.componentRef.setInput('facture', cible());
    fixture.componentRef.setInput('soldeRestant', 5_000);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };

    c.submit();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
    expect(c.submitting()).toBe(false);
  });

  it("annule la fenêtre en attente si le composant est détruit avant les 5 secondes", () => {
    vi.useFakeTimers();
    const { fixture, c, enregistrerPaiement } = setup({ solde: 5_000 });
    c.submit();
    fixture.destroy();
    vi.advanceTimersByTime(6_000);
    expect(enregistrerPaiement).not.toHaveBeenCalled();
  });

  // ── Ce qui s'affiche ─────────────────────────────────────────────────────

  it('désactive le bouton de soumission quand le formulaire est invalide', () => {
    const { fixture, c, racine } = (() => {
      const r = setup({ solde: null });
      return { ...r, racine: r.fixture.nativeElement as HTMLElement };
    })();
    const bouton = racine.querySelector('.paiement-form__submit') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    c.pMontant.set('1000');
    fixture.detectChanges();
    expect(bouton.disabled).toBe(false);
  });

  it('affiche le champ référence comme obligatoire seulement en mode tracé', () => {
    const { fixture, c } = setup({ solde: 5_000 });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector(`#${c.refId()}`)?.getAttribute('aria-required')).toBe('false');
    c.pMode.set('VIREMENT');
    fixture.detectChanges();
    expect(racine.querySelector(`#${c.refId()}`)?.getAttribute('aria-required')).toBe('true');
  });

  it('affiche l’indication d’excédent seulement quand il y en a un', () => {
    const { fixture, c } = setup({ solde: 5_000 });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.pf-hint--info')).toBeNull();
    c.pMontant.set('8000');
    fixture.detectChanges();
    expect(racine.querySelector('.pf-hint--info')?.textContent).toContain((3_000).toLocaleString('fr-FR'));
  });
});
