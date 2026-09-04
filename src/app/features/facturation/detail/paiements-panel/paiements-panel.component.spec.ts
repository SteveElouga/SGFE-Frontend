import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PaiementsPanelComponent } from './paiements-panel.component';
import { FacturesService } from '../../../../core/factures/factures.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { FactureDetail, PaiementFacture, SoldeDetail } from '../../../../graphql/vues';

/**
 * Carte « Historique des paiements » de la fiche facture.
 *
 * Ces tests portent sur ce qui distingue vraiment cet écran : le bouton
 * d'ajout n'apparaît que s'il reste un solde, un paiement annulé garde sa
 * trace visible plutôt que de disparaître, et chaque action (renvoyer un
 * reçu, ouvrir l'annulation) remonte exactement le paiement cliqué — jamais
 * un autre.
 */
function facture(p: Partial<FactureDetail> = {}): FactureDetail {
  return { factureId: 'f-1', abonneId: 'ab-1', numeroFacture: 'FACT-1', ...p } as FactureDetail;
}

function paiement(p: Partial<PaiementFacture> = {}): PaiementFacture {
  return {
    paiementId: 'p-1',
    montant: 5000,
    datePaiement: '2026-08-01',
    modePaiement: 'ESPECES',
    referenceTransaction: '',
    annule: false,
    ...p,
  } as PaiementFacture;
}

function solde(p: Partial<SoldeDetail> = {}): SoldeDetail {
  return { montantTotal: 10000, montantPaye: 5000, soldeRestant: 5000, ...p } as SoldeDetail;
}

function monter(over: Partial<{
  paiements: PaiementFacture[];
  solde: SoldeDetail | null;
  pctPaye: number;
  soldeRestant: number;
  factureStatut: string;
  canAddPaiement: boolean;
  peutAnnulerPaiement: boolean;
  envoiRecuEnCours: string | null;
  showForm: boolean;
}> = {}) {
  TestBed.configureTestingModule({
    imports: [PaiementsPanelComponent],
    providers: [
      provideTranslateService({}),
      { provide: FacturesService, useValue: { getSoldeFacture: vi.fn().mockResolvedValue({ soldeRestant: 0 }) } },
      { provide: ToastService, useValue: { info: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PaiementsPanelComponent);
  fixture.componentRef.setInput('facture', facture());
  fixture.componentRef.setInput('paiements', over.paiements ?? []);
  fixture.componentRef.setInput('solde', 'solde' in over ? over.solde : solde());
  fixture.componentRef.setInput('pctPaye', over.pctPaye ?? 50);
  fixture.componentRef.setInput('soldeRestant', over.soldeRestant ?? 5000);
  fixture.componentRef.setInput('factureStatut', over.factureStatut ?? 'PARTIELLE');
  fixture.componentRef.setInput('canAddPaiement', over.canAddPaiement ?? true);
  fixture.componentRef.setInput('peutAnnulerPaiement', over.peutAnnulerPaiement ?? true);
  fixture.componentRef.setInput('envoiRecuEnCours', over.envoiRecuEnCours ?? null);
  fixture.componentRef.setInput('showForm', over.showForm ?? false);
  fixture.detectChanges();
  const racine = fixture.nativeElement as HTMLElement;
  return { fixture, c: fixture.componentInstance, racine };
}

describe('PaiementsPanelComponent', () => {
  it('affiche un état vide quand aucun paiement n’existe', () => {
    const { racine } = monter({ paiements: [] });
    expect(racine.querySelector('.empty-hint')).toBeTruthy();
    expect(racine.querySelectorAll('.paiement-row')).toHaveLength(0);
  });

  it('liste chaque paiement, un par un', () => {
    const { racine } = monter({
      paiements: [paiement({ paiementId: 'p-1' }), paiement({ paiementId: 'p-2' })],
    });
    expect(racine.querySelectorAll('.paiement-row')).toHaveLength(2);
  });

  it('le bouton « + Paiement » apparaît quand il reste un solde', () => {
    const { racine } = monter({ factureStatut: 'PARTIELLE', canAddPaiement: true });
    expect(racine.querySelector('.btn--primary')).toBeTruthy();
  });

  it('le bouton « + Paiement » disparaît sur une facture soldée', () => {
    const { racine } = monter({ factureStatut: 'PAYEE', canAddPaiement: false });
    expect(racine.querySelector('.btn--primary')).toBeNull();
  });

  it('le bouton « + Paiement » disparaît quand le solde backend est déjà à zéro', () => {
    // Le statut seul ne suffit pas (synchro dégradée) : `canAddPaiement` fait foi.
    const { racine } = monter({ factureStatut: 'PARTIELLE', canAddPaiement: false });
    expect(racine.querySelector('.btn--primary')).toBeNull();
  });

  it('un paiement annulé garde sa trace visible, avec son badge propre', () => {
    const { racine } = monter({ paiements: [paiement({ annule: true })] });
    expect(racine.querySelector('.paiement-badge--annule')).toBeTruthy();
    // Ni renvoi de reçu ni annulation sur un paiement déjà annulé.
    expect(racine.querySelector('.paiement-row__annuler')).toBeNull();
  });

  it('propose renvoi de reçu et annulation quand l’utilisateur en a le droit', () => {
    const { racine } = monter({ paiements: [paiement()], peutAnnulerPaiement: true });
    expect(racine.querySelector('.paiement-row__recu')).toBeTruthy();
    expect(racine.querySelector('.paiement-row__annuler')).toBeTruthy();
  });

  it('masque ces actions à qui n’a pas le droit d’annuler', () => {
    const { racine } = monter({ paiements: [paiement()], peutAnnulerPaiement: false });
    expect(racine.querySelector('.paiement-row__recu')).toBeNull();
    expect(racine.querySelector('.paiement-row__annuler')).toBeNull();
  });

  it('remonte le paiement exact cliqué pour l’envoi du reçu', () => {
    const { c, racine } = monter({
      paiements: [paiement({ paiementId: 'p-1' }), paiement({ paiementId: 'p-2' })],
    });
    const recus: PaiementFacture[] = [];
    c.envoyerRecu.subscribe((p) => recus.push(p));
    const boutons = [...racine.querySelectorAll('.paiement-row__recu')] as HTMLButtonElement[];
    boutons[1].click();
    expect(recus[0]?.paiementId).toBe('p-2');
  });

  it('remonte le paiement exact cliqué pour l’ouverture de l’annulation', () => {
    const { c, racine } = monter({ paiements: [paiement({ paiementId: 'p-9' })] });
    const recus: PaiementFacture[] = [];
    c.ouvrirAnnulation.subscribe((p) => recus.push(p));
    (racine.querySelector('.paiement-row__annuler') as HTMLButtonElement).click();
    expect(recus[0]?.paiementId).toBe('p-9');
  });

  it('émet toggleForm au clic sur « + Paiement »', () => {
    const { c, racine } = monter();
    let count = 0;
    c.toggleForm.subscribe(() => count++);
    (racine.querySelector('.btn--primary') as HTMLButtonElement).click();
    expect(count).toBe(1);
  });

  it('affiche la barre de progression avec le pourcentage payé', () => {
    const { racine } = monter({ pctPaye: 42 });
    const track = racine.querySelector('.progress-bar__track');
    expect(track?.getAttribute('aria-valuenow')).toBe('42');
  });

  it('ne montre pas de barre de progression sans solde chargé', () => {
    const { racine } = monter({ solde: null });
    expect(racine.querySelector('.progress-bar')).toBeNull();
  });

  it('affiche le formulaire d’encaissement uniquement quand `showForm` est vrai', () => {
    const { racine } = monter({ showForm: false });
    expect(racine.querySelector('app-paiement-form')).toBeNull();
  });

  it('monte le formulaire d’encaissement quand `showForm` passe à vrai', () => {
    const { racine } = monter({ showForm: true });
    expect(racine.querySelector('app-paiement-form')).toBeTruthy();
  });

  it('formatDate renvoie un tiret pour une date vide', () => {
    const { c } = monter();
    expect(c.formatDate('')).toBe('—');
  });
});
