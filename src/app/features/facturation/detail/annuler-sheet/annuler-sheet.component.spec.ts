import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AnnulerSheetComponent } from './annuler-sheet.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Envoi, Facture, SoldeFacture } from '../../../../shared/models/facture.model';

/**
 * Annuler une facture efface une dette. C'est le geste le plus lourd de
 * l'application — plus lourd que d'en créer une, parce qu'il retire quelque
 * chose que quelqu'un devait, et potentiellement quelque chose qu'on lui a déjà
 * réclamé.
 *
 * Ces tests portent sur les trois garde-fous : le motif sans lequel il ne reste
 * aucune trace de la raison, le récapitulatif qui dit ce que devient l'argent
 * déjà versé, et l'avertissement quand l'abonné tient déjà la facture en main.
 */
function facture(p: Partial<Facture> = {}): Facture {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-2026-08-0001',
    abonneId: 'ab-1',
    campagneId: 'camp-1',
    ancienIndex: 100,
    nouveauIndex: 120,
    consommation: 20,
    prixM3: 500,
    montant: 10_000,
    statut: 'IMPAYEE',
    dateReleve: '2026-08-01',
    dateLimitePaiement: '2026-08-16',
    dateGeneration: '2026-08-01',
    pdfPath: '',
    numeroMobileMoney: '',
    ...p,
  } as Facture;
}

function solde(montantPaye = 0): SoldeFacture {
  return {
    factureId: 'f-1',
    montantTotal: 10_000,
    montantPaye,
    soldeRestant: 10_000 - montantPaye,
    statut: montantPaye > 0 ? 'PARTIELLE' : 'IMPAYEE',
    abonneId: 'ab-1',
    dateLimitePaiement: '2026-08-16',
  } as SoldeFacture;
}

function envoi(statut: string): Envoi {
  return { envoiId: 'e-1', statut, typeEnvoi: 'FACTURE' } as Envoi;
}

describe('AnnulerSheetComponent', () => {
  function setup(over: Partial<{ f: Facture; s: SoldeFacture; e: Envoi[] }> = {}) {
    const annulerFacture = vi.fn().mockResolvedValue(facture({ statut: 'ANNULEE' }));
    const regenererFacture = vi.fn().mockResolvedValue({
      annulee: facture({ statut: 'ANNULEE' }),
      nouvelle: facture({ factureId: 'f-2', numeroFacture: 'FACT-2026-08-0002' }),
    });

    TestBed.configureTestingModule({
      imports: [AnnulerSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { annulerFacture, regenererFacture } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(AnnulerSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('facture', over.f ?? facture());
    fixture.componentRef.setInput('solde', over.s ?? solde());
    fixture.componentRef.setInput('envois', over.e ?? []);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, annulerFacture, regenererFacture };
  }

  it('refuse de valider sans motif', () => {
    const { c } = setup();
    expect(c.motifValide()).toBe(false);
    c.motif.set('ok');
    expect(c.motifValide()).toBe(false); // deux caractères, ce n'est pas une raison
    c.motif.set('Erreur');
    expect(c.motifValide()).toBe(true);
  });

  it('ne fait rien tant que le motif manque, même si on insiste', async () => {
    const { c, annulerFacture } = setup();
    await c.submit();
    expect(annulerFacture).not.toHaveBeenCalled();
  });

  it('annule avec le motif saisi, débarrassé de ses espaces', async () => {
    const { c, annulerFacture } = setup();
    c.motif.set('  Index du mauvais compteur  ');
    await c.submit();
    expect(annulerFacture).toHaveBeenCalledWith('f-1', 'Index du mauvais compteur');
  });

  it('régénère quand le mode le demande', async () => {
    const { c, regenererFacture, annulerFacture } = setup();
    c.mode.set('regenerer');
    c.motif.set('Index corrigé');
    await c.submit();
    expect(regenererFacture).toHaveBeenCalledWith('f-1', 'Index corrigé');
    expect(annulerFacture).not.toHaveBeenCalled();
  });

  it('remonte la facture de remplacement, pour que l’écran la suive', async () => {
    const { c } = setup();
    const recu: Array<Facture | null> = [];
    c.done.subscribe((v) => recu.push(v));
    c.mode.set('regenerer');
    c.motif.set('Index corrigé');
    await c.submit();
    expect(recu[0]?.numeroFacture).toBe('FACT-2026-08-0002');
  });

  it('ne remonte rien quand il n’y a pas de remplacement', async () => {
    const { c } = setup();
    const recu: Array<Facture | null> = [];
    c.done.subscribe((v) => recu.push(v));
    c.motif.set('Doublon');
    await c.submit();
    expect(recu[0]).toBeNull();
  });

  // ── Ce que devient l'argent déjà versé ────────────────────────────────────

  it('annonce le montant qui reviendra à l’abonné', () => {
    const { c } = setup({ s: solde(4_000) });
    expect(c.dejaVerse()).toBe(4_000);
  });

  it('ne l’annonce pas quand rien n’a été versé', () => {
    const { c } = setup({ s: solde(0) });
    expect(c.dejaVerse()).toBe(0);
  });

  // ── L'avertissement d'envoi ───────────────────────────────────────────────

  it('avertit quand la facture est déjà chez l’abonné', () => {
    const { c } = setup({ e: [envoi('ENVOYE')] });
    expect(c.dejaEnvoyee()).toBe(true);
  });

  it('un envoi en échec n’a rien mis entre ses mains — pas d’avertissement', () => {
    // Avertir pour une facture jamais arrivée ferait douter de l'avertissement
    // le jour où il compte.
    const { c } = setup({ e: [envoi('ECHEC')] });
    expect(c.dejaEnvoyee()).toBe(false);
  });

  it('un seul envoi réussi parmi des échecs suffit à avertir', () => {
    const { c } = setup({ e: [envoi('ECHEC'), envoi('ENVOYE'), envoi('ECHEC')] });
    expect(c.dejaEnvoyee()).toBe(true);
  });

  // ── Ce qui se régénère, et ce qui ne se régénère pas ──────────────────────

  it('une régularisation ne propose pas la régénération', () => {
    // Son montant est déclaré, pas calculé : il n'y a rien à recalculer.
    const { c } = setup({ f: facture({ nature: 'REGULARISATION', campagneId: '' }) });
    expect(c.regenerationPossible()).toBe(false);
  });

  it('une facture sans campagne non plus', () => {
    const { c } = setup({ f: facture({ campagneId: '' }) });
    expect(c.regenerationPossible()).toBe(false);
  });

  it('une facture de consommation la propose', () => {
    const { c } = setup();
    expect(c.regenerationPossible()).toBe(true);
  });

  it('la fermeture remet le formulaire à zéro', () => {
    const { c } = setup();
    c.motif.set('Quelque chose');
    c.mode.set('regenerer');
    c.onClose();
    expect(c.motif()).toBe('');
    expect(c.mode()).toBe('annuler');
  });
});
