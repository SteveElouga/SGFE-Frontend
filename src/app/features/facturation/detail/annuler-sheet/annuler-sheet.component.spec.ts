import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { AnnulerSheetComponent } from './annuler-sheet.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Envoi, SoldeFacture } from '../../../../shared/models/facture.model';
import type { FactureDetail } from '../../../../graphql/vues';

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
function facture(p: Partial<FactureDetail> = {}): FactureDetail {
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
  } as FactureDetail;
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
  function setup(over: Partial<{ f: FactureDetail; s: SoldeFacture; e: Envoi[] }> = {}) {
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
    const recu: Array<{ numeroFacture: string } | null> = [];
    c.done.subscribe((v) => recu.push(v));
    c.mode.set('regenerer');
    c.motif.set('Index corrigé');
    await c.submit();
    expect(recu[0]?.numeroFacture).toBe('FACT-2026-08-0002');
  });

  it('ne remonte rien quand il n’y a pas de remplacement', async () => {
    const { c } = setup();
    const recu: Array<{ numeroFacture: string } | null> = [];
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

/**
 * Ce que la feuille montre, et pas seulement ce qu'elle calcule.
 *
 * Les tests précédents portaient sur ses décisions — quel mode, quel motif,
 * quelle mutation. Restait l'affichage : un récapitulatif juste qui ne
 * s'affiche pas ne sert à rien, et c'est justement l'affichage qui doit
 * dissuader quelqu'un d'annuler une facture par mégarde.
 *
 * Ces tests lisent le DOM. Ils n'écrivent rien nulle part, ne demandent aucune
 * session, et ne touchent à aucune donnée réelle — ce qui est la seule façon de
 * vérifier cet écran sans créer la dette qu'on prétend annuler.
 */
describe('AnnulerSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{ f: FactureDetail; s: SoldeFacture; e: Envoi[] }> = {}) {
    TestBed.configureTestingModule({
      imports: [AnnulerSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        {
          provide: FacturesService,
          useValue: { annulerFacture: vi.fn(), regenererFacture: vi.fn() },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    // Les vraies chaînes françaises, pas les clés : ce qui est vérifié ici est
    // ce que l'utilisateur lit. Charger le fichier réel fait au passage tomber
    // le test si une clé manque.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(AnnulerSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('facture', over.f ?? facture());
    fixture.componentRef.setInput('solde', over.s ?? solde());
    fixture.componentRef.setInput('envois', over.e ?? []);
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      texte: () => racine.textContent ?? '',
      valider: () =>
        [...racine.querySelectorAll('button')].find((b) =>
          b.classList.contains('ann-btn--valider'),
        ) as HTMLButtonElement,
      alerte: () => racine.querySelector('.ann-alerte'),
      recap: () => racine.querySelector('.ann-recap'),
      modes: () => [...racine.querySelectorAll('.ann-mode')] as HTMLElement[],
    };
  }

  // ── Le garde-fou visible ─────────────────────────────────────────────────

  it('le bouton de validation est désactivé tant qu’il n’y a pas de motif', () => {
    const { valider, fixture, c } = monter();
    expect(valider().disabled).toBe(true);

    c.motif.set('Index du mauvais compteur');
    fixture.detectChanges();
    expect(valider().disabled).toBe(false);
  });

  it('le récapitulatif dit que la facture reste au journal', () => {
    // C'est ce qui distingue une annulation d'une suppression, et personne ne
    // le devine : il faut l'écrire.
    const { recap, texte } = monter();
    expect(recap()).toBeTruthy();
    expect(texte()).toMatch(/journal/i);
  });

  it('il annonce le montant qui reviendra à l’abonné', () => {
    const { texte } = monter({ s: solde(4_000) });
    expect(texte()).toMatch(/4[\s  ]?000/);
  });

  it('et se tait quand rien n’a été versé', () => {
    // Une ligne « 0 FCFA vous seront rendus » userait l'attention pour rien.
    const { texte } = monter({ s: solde(0) });
    expect(texte()).not.toMatch(/reviennent au crédit/i);
  });

  // ── L'avertissement d'envoi ──────────────────────────────────────────────

  it('avertit à l’écran quand la facture est déjà partie', () => {
    const { alerte, texte } = monter({ e: [envoi('ENVOYE')] });
    expect(alerte()).toBeTruthy();
    expect(texte()).toMatch(/WhatsApp/i);
  });

  it('n’affiche rien quand l’envoi a échoué', () => {
    const { alerte } = monter({ e: [envoi('ECHEC')] });
    expect(alerte()).toBeNull();
  });

  it('l’avertissement est une information, pas un blocage', () => {
    // Une erreur d'index se découvre justement après l'envoi : bloquer ici
    // interdirait la correction au moment précis où elle devient nécessaire.
    const { valider, fixture, c } = monter({ e: [envoi('ENVOYE')] });
    c.motif.set('Index corrigé');
    fixture.detectChanges();
    expect(valider().disabled).toBe(false);
  });

  // ── Le choix entre annuler et régénérer ──────────────────────────────────

  it('les deux modes sont proposés pour une facture de consommation', () => {
    const { modes } = monter();
    expect(modes()).toHaveLength(2);
  });

  it('chaque mode porte son explication — son nom ne suffit pas', () => {
    // « Régénérer » ne se devine pas, et c'est la différence entre les deux
    // qu'il faut comprendre avant de choisir.
    const { modes } = monter();
    for (const m of modes()) {
      expect(m.querySelector('.ann-mode__desc')?.textContent?.trim().length ?? 0).toBeGreaterThan(10);
    }
  });

  it('aucun mode n’est proposé pour une régularisation', () => {
    const { modes } = monter({ f: facture({ nature: 'REGULARISATION', campagneId: '' }) });
    expect(modes()).toHaveLength(0);
  });

  it('le récapitulatif change avec le mode choisi', () => {
    const { fixture, c, texte } = monter();
    const avant = texte();
    c.mode.set('regenerer');
    fixture.detectChanges();
    expect(texte()).not.toBe(avant);
  });

  // ── Le ton de l'écran ────────────────────────────────────────────────────

  it('le numéro de la facture est affiché — on annule celle-ci, pas une autre', () => {
    const { texte } = monter();
    expect(texte()).toContain('FACT-2026-08-0001');
  });

  it('le champ de motif porte une étiquette, pas seulement un indice', () => {
    const { racine } = monter();
    const champ = racine.querySelector('#ann-motif');
    expect(champ).toBeTruthy();
    expect(racine.querySelector('label[for="ann-motif"]')).toBeTruthy();
  });
});
