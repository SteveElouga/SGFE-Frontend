import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AnnulerPaiementSheetComponent } from './annuler-paiement-sheet.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Paiement } from '../../../../shared/models/facture.model';

/**
 * Annuler un paiement rétablit une dette : l'impayé réapparaît, et l'abonné
 * qui croyait avoir soldé redevient débiteur. Le geste doit donc coûter un
 * motif, et ne partir qu'une fois.
 *
 * Ces tests portent sur les trois garde-fous : le motif sans lequel il ne
 * reste aucune trace de la raison, l'absence de double envoi pendant que la
 * requête est en vol, et le fait qu'un échec serveur ne fasse pas croire à un
 * succès.
 */
function paiement(p: Partial<Paiement> = {}): Paiement {
  return {
    paiementId: 'p-1',
    factureId: 'f-1',
    montant: 5000,
    datePaiement: '2026-08-28',
    modePaiement: 'ESPECES',
    referenceTransaction: '',
    createdAt: '2026-08-28T10:00:00Z',
    annule: false,
    annuleLe: null,
    annulePar: null,
    motifAnnulation: null,
    ...p,
  } as Paiement;
}

describe('AnnulerPaiementSheetComponent', () => {
  let annulerPaiement: ReturnType<typeof vi.fn>;
  let succes: ReturnType<typeof vi.fn>;
  let erreur: ReturnType<typeof vi.fn>;

  function creer() {
    annulerPaiement = vi.fn().mockResolvedValue(paiement({ annule: true }));
    succes = vi.fn();
    erreur = vi.fn();

    TestBed.configureTestingModule({
      imports: [AnnulerPaiementSheetComponent],
      providers: [
        provideTranslateService({}),
        { provide: FacturesService, useValue: { annulerPaiement } },
        { provide: ToastService, useValue: { success: succes, error: erreur } },
      ],
    });

    const fixture = TestBed.createComponent(AnnulerPaiementSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('paiement', paiement());
    fixture.detectChanges();
    return fixture;
  }

  it('refuse un motif trop court — sans raison écrite, il ne reste rien à relire', () => {
    const f = creer();
    const c = f.componentInstance;

    c.motif.set('');
    expect(c.motifValide()).toBe(false);

    c.motif.set('ok');
    expect(c.motifValide()).toBe(false);

    c.motif.set('doublon');
    expect(c.motifValide()).toBe(true);
  });

  it("n'appelle pas le service tant que le motif est insuffisant", async () => {
    const f = creer();
    const c = f.componentInstance;

    c.motif.set('x');
    await c.submit();

    expect(annulerPaiement).not.toHaveBeenCalled();
  });

  it('transmet le motif nettoyé et signale la réussite', async () => {
    const f = creer();
    const c = f.componentInstance;

    c.motif.set('  saisi deux fois  ');
    await c.submit();

    expect(annulerPaiement).toHaveBeenCalledWith('p-1', 'saisi deux fois');
    expect(succes).toHaveBeenCalled();
  });

  it('ne part pas deux fois si la requête est encore en vol', async () => {
    const f = creer();
    const c = f.componentInstance;

    c.motif.set('doublon');
    c.submitting.set(true);
    await c.submit();

    expect(annulerPaiement).not.toHaveBeenCalled();
  });

  it("montre l'erreur du serveur plutôt qu'un faux succès", async () => {
    const f = creer();
    const c = f.componentInstance;
    annulerPaiement.mockRejectedValueOnce(new Error('Ce paiement est déjà annulé.'));

    c.motif.set('deuxieme tentative');
    await c.submit();

    expect(erreur).toHaveBeenCalled();
    expect(succes).not.toHaveBeenCalled();
    // Le verrou doit se relever, sinon la feuille reste morte après un échec.
    expect(c.submitting()).toBe(false);
  });
});
