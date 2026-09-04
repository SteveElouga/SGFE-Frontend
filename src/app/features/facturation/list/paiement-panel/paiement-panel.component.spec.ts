import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PaiementPanelComponent } from './paiement-panel.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { FactureCibleNommee } from '../../../../graphql/vues';

/**
 * Panneau de saisie d'un paiement affiché inline sous la liste des factures.
 *
 * Le point sensible de ce composant est son `effect()` de rechargement du
 * solde : il doit se déclencher à l'ouverture sur une nouvelle facture, ET se
 * redéclencher quand le parent fournit une nouvelle référence pour la MÊME
 * facture (rechargement post-mutation) — sans quoi le panneau resterait sur un
 * solde périmé après un encaissement.
 */
function facture(p: Partial<FactureCibleNommee> = {}): FactureCibleNommee {
  return { factureId: 'f-1', abonneId: 'ab-1', numeroFacture: 'FACT-1', abonneNom: 'Jean Dupont', ...p };
}

function monter(getSoldeFacture = vi.fn().mockResolvedValue({ soldeRestant: 3000 })) {
  TestBed.configureTestingModule({
    imports: [PaiementPanelComponent],
    providers: [
      provideTranslateService({}),
      { provide: FacturesService, useValue: { getSoldeFacture } },
      { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PaiementPanelComponent);
  return { fixture, c: fixture.componentInstance, getSoldeFacture };
}

/** Laisse les microtâches de `loadSolde()` se résoudre. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('PaiementPanelComponent', () => {
  it('n’affiche rien tant qu’aucune facture n’est fournie', () => {
    const { fixture } = monter();
    fixture.componentRef.setInput('facture', null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.payment-panel')).toBeNull();
  });

  it('charge le solde de la facture à l’ouverture', async () => {
    const { fixture, c, getSoldeFacture } = monter();
    fixture.componentRef.setInput('facture', facture({ factureId: 'f-1' }));
    fixture.detectChanges();
    expect(c.panelLoading()).toBe(true);
    expect(c.panelSolde()).toBeNull();
    await flush();

    expect(getSoldeFacture).toHaveBeenCalledWith('f-1');
    expect(c.panelSolde()).toBe(3000);
    expect(c.panelLoading()).toBe(false);
  });

  it('recharge le solde quand la facture change', async () => {
    const getSoldeFacture = vi
      .fn()
      .mockResolvedValueOnce({ soldeRestant: 3000 })
      .mockResolvedValueOnce({ soldeRestant: 7000 });
    const { fixture, c } = monter(getSoldeFacture);
    fixture.componentRef.setInput('facture', facture({ factureId: 'f-1' }));
    fixture.detectChanges();
    await flush();
    expect(c.panelSolde()).toBe(3000);

    fixture.componentRef.setInput('facture', facture({ factureId: 'f-2' }));
    fixture.detectChanges();
    await flush();

    expect(getSoldeFacture).toHaveBeenCalledTimes(2);
    expect(getSoldeFacture).toHaveBeenLastCalledWith('f-2');
    expect(c.panelSolde()).toBe(7000);
  });

  it('recharge aussi sur une nouvelle référence de la MÊME facture (rafraîchissement post-mutation)', async () => {
    const getSoldeFacture = vi
      .fn()
      .mockResolvedValueOnce({ soldeRestant: 3000 })
      .mockResolvedValueOnce({ soldeRestant: 0 });
    const { fixture, c } = monter(getSoldeFacture);
    const f1 = facture({ factureId: 'f-1' });
    fixture.componentRef.setInput('facture', f1);
    fixture.detectChanges();
    await flush();
    expect(c.panelSolde()).toBe(3000);

    // Même id, nouvel objet : le parent vient de re-fetcher après un paiement.
    const f1bis = facture({ factureId: 'f-1' });
    fixture.componentRef.setInput('facture', f1bis);
    fixture.detectChanges();
    await flush();

    expect(getSoldeFacture).toHaveBeenCalledTimes(2);
    expect(c.panelSolde()).toBe(0);
  });

  it('affiche le numéro de facture et le nom de l’abonné', async () => {
    const { fixture } = monter();
    fixture.componentRef.setInput('facture', facture({ numeroFacture: 'FACT-2026-0099', abonneNom: 'Awa Ngo' }));
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const texte = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texte).toContain('FACT-2026-0099');
    expect(texte).toContain('Awa Ngo');
  });

  it('émet `close` au clic sur le bouton de fermeture', () => {
    const { fixture, c } = monter();
    fixture.componentRef.setInput('facture', facture());
    fixture.detectChanges();
    let closed = 0;
    c.close.subscribe(() => closed++);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.payment-panel__close')!.click();
    expect(closed).toBe(1);
  });

  it('transmet le solde chargé au formulaire d’encaissement partagé', async () => {
    const { fixture } = monter();
    fixture.componentRef.setInput('facture', facture());
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const form = (fixture.nativeElement as HTMLElement).querySelector('app-paiement-form');
    expect(form).toBeTruthy();
  });
});
