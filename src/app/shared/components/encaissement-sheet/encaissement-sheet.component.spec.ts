import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { EncaissementSheetComponent } from './encaissement-sheet.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { ToastService } from '../../services/toast.service';
import type { SoldeDetail } from '../../../graphql/vues';

/**
 * Encaissement au nom d'un abonné : la ventilation la plus ancienne d'abord.
 * Reprend fidèlement `FacturesService.previsualiserImputation` (plus vieille
 * échéance d'abord, le reste au crédit) pour que les calculs dérivés du
 * composant — jours de retard, excédent — se vérifient sur une imputation
 * réaliste, pas sur une valeur inventée par le test.
 */
function previsualiserImputationReelle(
  montant: number,
  soldes: ReadonlyArray<{ factureId: string; numeroFacture: string; soldeRestant: number; dateLimitePaiement: string }>,
) {
  const ordonnes = [...soldes]
    .filter((s) => s.soldeRestant > 0)
    .sort((a, b) => (a.dateLimitePaiement || '9999').localeCompare(b.dateLimitePaiement || '9999'));
  const parts: Array<{ factureId: string; numeroFacture: string; part: number; dateLimitePaiement: string }> = [];
  let restant = montant;
  for (const s of ordonnes) {
    if (restant <= 0) break;
    const part = Math.min(restant, s.soldeRestant);
    parts.push({ factureId: s.factureId, numeroFacture: s.numeroFacture, part, dateLimitePaiement: s.dateLimitePaiement });
    restant -= part;
  }
  return parts;
}

function solde(p: Partial<SoldeDetail> = {}): SoldeDetail {
  return {
    factureId: 'f-1',
    montantTotal: 10_000,
    montantPaye: 0,
    soldeRestant: 10_000,
    statut: 'IMPAYEE',
    abonneId: 'ab-1',
    dateLimitePaiement: '2026-08-16',
    ...p,
  } as SoldeDetail;
}

describe('EncaissementSheetComponent', () => {
  function setup(over: Partial<{ soldes: SoldeDetail[]; avoir: number; numeros: Record<string, string> }> = {}) {
    const enregistrerPaiementAbonne = vi.fn().mockResolvedValue({ paiements: [{ paiementId: 'p-1' }], excedentEnAvoir: 0 });
    const previsualiserImputation = vi.fn(previsualiserImputationReelle);

    TestBed.configureTestingModule({
      imports: [EncaissementSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { previsualiserImputation, enregistrerPaiementAbonne } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(EncaissementSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonneId', 'ab-1');
    fixture.componentRef.setInput('abonneNom', 'Awa Koné');
    fixture.componentRef.setInput('soldes', over.soldes ?? [solde()]);
    if (over.avoir !== undefined) fixture.componentRef.setInput('avoir', over.avoir);
    if (over.numeros !== undefined) fixture.componentRef.setInput('numerosParFacture', over.numeros);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, enregistrerPaiementAbonne, previsualiserImputation };
  }

  // ── Ce que le formulaire calcule ──────────────────────────────────────────

  it('le total dû additionne les soldes restants', () => {
    const { c } = setup({
      soldes: [solde({ factureId: 'f-1', soldeRestant: 6_000 }), solde({ factureId: 'f-2', soldeRestant: 4_000 })],
    });
    expect(c.totalDu()).toBe(10_000);
    expect(c.totalDuFormate()).toContain('10');
    expect(c.totalDuFormate()).toContain('FCFA');
  });

  it("n'exige une référence que pour les modes tracés", () => {
    const { c } = setup();
    expect(c.referenceRequise()).toBe(false);
    c.mode.set('MOBILE_MONEY');
    expect(c.referenceRequise()).toBe(true);
    c.mode.set('VIREMENT');
    expect(c.referenceRequise()).toBe(true);
    c.mode.set('ESPECES');
    expect(c.referenceRequise()).toBe(false);
  });

  it("n'impute rien tant qu'aucun montant n'est saisi", () => {
    const { c } = setup();
    expect(c.imputation()).toEqual([]);
  });

  it('impute le plus ancien solde en premier', () => {
    const { c } = setup({
      soldes: [
        solde({ factureId: 'recent', soldeRestant: 5_000, dateLimitePaiement: '2026-09-01' }),
        solde({ factureId: 'vieux', soldeRestant: 5_000, dateLimitePaiement: '2026-07-01' }),
      ],
    });
    c.montant.set(5_000);
    const parts = c.imputation();
    expect(parts).toHaveLength(1);
    expect(parts[0].factureId).toBe('vieux');
    expect(parts[0].part).toBe(5_000);
  });

  it('répartit sur plusieurs factures quand le montant dépasse la première', () => {
    const { c } = setup({
      soldes: [
        solde({ factureId: 'vieux', soldeRestant: 4_000, dateLimitePaiement: '2026-07-01' }),
        solde({ factureId: 'recent', soldeRestant: 6_000, dateLimitePaiement: '2026-08-01' }),
      ],
    });
    c.montant.set(7_000);
    const parts = c.imputation();
    expect(parts).toEqual([
      expect.objectContaining({ factureId: 'vieux', part: 4_000 }),
      expect.objectContaining({ factureId: 'recent', part: 3_000 }),
    ]);
  });

  it("l'excédent part au crédit une fois toute la dette éteinte", () => {
    const { c } = setup({ soldes: [solde({ soldeRestant: 5_000 })] });
    c.montant.set(8_000);
    expect(c.excedent()).toBe(3_000);
  });

  it("aucun excédent quand le montant ne couvre pas la dette", () => {
    const { c } = setup({ soldes: [solde({ soldeRestant: 5_000 })] });
    c.montant.set(3_000);
    expect(c.excedent()).toBe(0);
  });

  it('calcule les jours de retard sur chaque part imputée', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T09:00:00'));
    const { c } = setup({ soldes: [solde({ dateLimitePaiement: '2026-08-10' })] });
    c.montant.set(5_000);
    expect(c.imputation()[0].joursDeRetard).toBe(10);
    vi.useRealTimers();
  });

  it("n'affiche pas de retard négatif pour une échéance future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T09:00:00'));
    const { c } = setup({ soldes: [solde({ dateLimitePaiement: '2026-09-01' })] });
    c.montant.set(5_000);
    expect(c.imputation()[0].joursDeRetard).toBe(0);
    vi.useRealTimers();
  });

  it('nomme la part avec le numéro de facture fourni', () => {
    const { c } = setup({
      soldes: [solde({ factureId: 'f-1' })],
      numeros: { 'f-1': 'FACT-2026-08-0001' },
    });
    c.montant.set(1_000);
    expect(c.imputation()[0].numeroFacture).toBe('FACT-2026-08-0001');
  });

  it('à défaut de numéro connu, retombe sur un extrait de l’identifiant', () => {
    const { c } = setup({
      soldes: [solde({ factureId: 'abcdefgh-1234' })],
      numeros: {},
    });
    c.montant.set(1_000);
    expect(c.imputation()[0].numeroFacture).toBe('abcdefgh');
  });

  // ── Validation du formulaire ───────────────────────────────────────────────

  it('le formulaire est invalide sans montant', () => {
    const { c } = setup();
    expect(c.formValide()).toBe(false);
  });

  it('un montant positif seul suffit en espèces', () => {
    const { c } = setup();
    c.montant.set(2_000);
    expect(c.formValide()).toBe(true);
  });

  it('un montant sans référence est invalide en mobile money', () => {
    const { c } = setup();
    c.montant.set(2_000);
    c.mode.set('MOBILE_MONEY');
    expect(c.formValide()).toBe(false);
    c.reference.set('TXN-123');
    expect(c.formValide()).toBe(true);
  });

  it('un montant à zéro ou négatif est invalide', () => {
    const { c } = setup();
    c.montant.set(0);
    expect(c.formValide()).toBe(false);
  });

  // ── Soumission ─────────────────────────────────────────────────────────────

  it('enregistre le paiement avec les bons champs et réinitialise le formulaire', async () => {
    const { c, enregistrerPaiementAbonne } = setup();
    c.montant.set(5_000);
    c.mode.set('VIREMENT');
    c.reference.set(' REF-42 ');

    await c.submit();

    expect(enregistrerPaiementAbonne).toHaveBeenCalledWith(
      expect.objectContaining({
        abonneId: 'ab-1',
        montant: 5_000,
        modePaiement: 'VIREMENT',
        referenceTransaction: 'REF-42',
      }),
    );
    expect(c.montant()).toBeNull();
    expect(c.reference()).toBe('');
    expect(c.mode()).toBe('ESPECES');
  });

  it('émet saved puis close après un enregistrement réussi', async () => {
    const { c } = setup();
    const savedEvents: void[] = [];
    const closedEvents: void[] = [];
    c.saved.subscribe(() => savedEvents.push(undefined));
    c.close.subscribe(() => closedEvents.push(undefined));
    c.montant.set(5_000);

    await c.submit();

    expect(savedEvents).toHaveLength(1);
    expect(closedEvents).toHaveLength(1);
  });

  it('ne soumet rien si le formulaire est invalide', async () => {
    const { c, enregistrerPaiementAbonne } = setup();
    await c.submit();
    expect(enregistrerPaiementAbonne).not.toHaveBeenCalled();
  });

  it('affiche une erreur et laisse le formulaire intact quand la mutation échoue', async () => {
    const enregistrerPaiementAbonne = vi.fn().mockRejectedValue(new Error('Le serveur est indisponible'));
    TestBed.configureTestingModule({
      imports: [EncaissementSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: FacturesService, useValue: { previsualiserImputation: vi.fn(previsualiserImputationReelle), enregistrerPaiementAbonne } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(EncaissementSheetComponent);
    fixture.componentRef.setInput('abonneId', 'ab-1');
    fixture.componentRef.setInput('soldes', [solde()]);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    c.montant.set(5_000);

    await c.submit();

    expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
    expect(c.montant()).toBe(5_000); // pas réinitialisé : rien n'a été enregistré
  });

  it('onClose réinitialise le formulaire et émet close', () => {
    const { c } = setup();
    c.montant.set(1_000);
    c.reference.set('x');
    const closedEvents: void[] = [];
    c.close.subscribe(() => closedEvents.push(undefined));

    c.onClose();

    expect(c.montant()).toBeNull();
    expect(c.reference()).toBe('');
    expect(closedEvents).toHaveLength(1);
  });

  // ── Ce qui s'affiche ─────────────────────────────────────────────────────

  describe('affichage', () => {
    function monter(over: Parameters<typeof setup>[0] = {}) {
      const { fixture, c } = setup(over);
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr', fr as unknown as TranslationObject);
      translate.use('fr');
      fixture.detectChanges();
      return { fixture, c, racine: fixture.nativeElement as HTMLElement };
    }

    it('ne montre pas de ligne avoir quand il est nul', () => {
      const { racine } = monter({ avoir: 0 });
      expect(racine.querySelector('.enc-avoir')).toBeNull();
    });

    it('affiche la ligne avoir quand il y en a un', () => {
      const { racine } = monter({ avoir: 2_000 });
      expect(racine.querySelector('.enc-avoir')).toBeTruthy();
    });

    it('affiche la référence seulement pour un mode tracé', () => {
      const { fixture, c, racine } = monter();
      expect(racine.querySelector('#enc-ref')).toBeNull();
      c.mode.set('MOBILE_MONEY');
      fixture.detectChanges();
      expect(racine.querySelector('#enc-ref')).toBeTruthy();
    });

    it('le bouton valider est désactivé sans montant', () => {
      const { racine } = monter();
      const valider = racine.querySelector('.enc-btn--valider') as HTMLButtonElement;
      expect(valider.disabled).toBe(true);
    });

    it('affiche la ventilation dès qu’un montant est saisi', () => {
      const { fixture, c, racine } = monter({ soldes: [solde({ soldeRestant: 5_000 })] });
      expect(racine.querySelector('.enc-imput')).toBeNull();
      c.montant.set(3_000);
      fixture.detectChanges();
      expect(racine.querySelector('.enc-imput')).toBeTruthy();
      expect(racine.querySelectorAll('.enc-imput__ligne')).toHaveLength(1);
    });
  });
});
