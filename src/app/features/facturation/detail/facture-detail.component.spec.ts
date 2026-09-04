import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { FactureDetailComponent } from './facture-detail.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import type {
  AbonneDetail,
  CampagneDetail,
  EnvoiFacture,
  FactureDetail,
  PaiementFacture,
  SoldeDetail,
} from '../../../graphql/vues';

/**
 * Fiche facture — l'écran le plus dense de l'application (solde antérieur,
 * avoir imputé, statut corrigé à la main, annulation, journal WhatsApp,
 * paiements). Ces tests portent sur les invariants financiers qui ne doivent
 * jamais se casser silencieusement : le total à payer ne descend jamais sous
 * zéro, le statut backend (solde) fait toujours foi sur le statut affiché, et
 * une facture ANNULEE affiche le motif exact saisi à l'annulation (le champ
 * que `graphql/vues.ts` documente comme ayant vécu sans jamais s'afficher).
 */
function facture(p: Partial<FactureDetail> = {}): FactureDetail {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-2026-08-0001',
    abonneId: 'ab-1',
    abonneNom: 'Jean Dupont',
    abonneNumero: 'AB-0001',
    campagneId: 'camp-1',
    campagneNom: 'Août 2026',
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
    campagnePeriodeMois: 8,
    campagnePeriodeAnnee: 2026,
    motifAnnulation: '',
    dateAnnulation: '',
    annuleePar: '',
    remplaceeParId: '',
    remplaceId: '',
    nature: 'CONSOMMATION',
    motif: '',
    ...p,
  } as FactureDetail;
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
    avoirImpute: 0,
    ...p,
  } as SoldeDetail;
}

function paiement(p: Partial<PaiementFacture> = {}): PaiementFacture {
  return { paiementId: 'p-1', montant: 5000, datePaiement: '2026-08-05', modePaiement: 'ESPECES', referenceTransaction: '', annule: false, ...p } as PaiementFacture;
}

function envoi(p: Partial<EnvoiFacture> = {}): EnvoiFacture {
  return { envoiId: 'e-1', statut: 'ENVOYE', dateEnvoi: '2026-08-01', typeEnvoi: 'FACTURE', erreur: '', ...p } as EnvoiFacture;
}

function abonne(p: Partial<AbonneDetail> = {}): AbonneDetail {
  return { id: 'ab-1', nom: 'Dupont', prenom: 'Jean', numeroAbonne: 'AB-0001', compteur: null } as AbonneDetail;
}

function campagne(p: Partial<CampagneDetail> = {}): CampagneDetail {
  return { campagneId: 'camp-1', nom: 'Août 2026', periodeMois: 8, periodeAnnee: 2026 } as CampagneDetail;
}

function monter(over: {
  routeParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  getFacture?: ReturnType<typeof vi.fn>;
  getSoldeFacture?: ReturnType<typeof vi.fn>;
  getPaiements?: ReturnType<typeof vi.fn>;
  getEnvois?: ReturnType<typeof vi.fn>;
  getAbonne?: ReturnType<typeof vi.fn>;
  getCampagne?: ReturnType<typeof vi.fn>;
  getDetteAbonne?: ReturnType<typeof vi.fn>;
  isAdmin?: boolean;
  isComptable?: boolean;
} = {}) {
  const getFacture = over.getFacture ?? vi.fn().mockResolvedValue(facture());
  const getSoldeFacture = over.getSoldeFacture ?? vi.fn().mockResolvedValue(solde());
  const getPaiements = over.getPaiements ?? vi.fn().mockResolvedValue([]);
  const getEnvois = over.getEnvois ?? vi.fn().mockResolvedValue([]);
  const getAbonne = over.getAbonne ?? vi.fn().mockResolvedValue(abonne());
  const getCampagne = over.getCampagne ?? vi.fn().mockResolvedValue(campagne());
  const getDetteAbonne = over.getDetteAbonne ?? vi.fn().mockResolvedValue({ totalDu: 0, nbFactures: 0, plusAncienneEcheance: null });
  const annulerFacture = vi.fn().mockResolvedValue(facture({ statut: 'ANNULEE' }));
  const updateStatutFacture = vi.fn().mockImplementation((id: string, statut: string) => Promise.resolve({ statut }));
  const envoyerFactureWhatsapp = vi.fn().mockResolvedValue({});
  const renvoyerFactureWhatsapp = vi.fn().mockResolvedValue({});
  const renvoyerEnvoi = vi.fn().mockResolvedValue({});
  const envoyerRecuPaiement = vi.fn().mockResolvedValue({});
  const navigate = vi.fn().mockResolvedValue(true);
  const open = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [FactureDetailComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate, navigateByUrl: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            params: { factureId: 'f-1', ...over.routeParams },
            queryParams: { ...over.queryParams },
          },
        },
      },
      {
        provide: FacturesService,
        useValue: {
          getFacture, getSoldeFacture, getPaiements, getEnvois, getDetteAbonne,
          annulerFacture, updateStatutFacture, envoyerFactureWhatsapp, renvoyerFactureWhatsapp,
          renvoyerEnvoi, envoyerRecuPaiement,
        },
      },
      { provide: AbonnesService, useValue: { getAbonne } },
      { provide: CampagnesService, useValue: { getCampagne } },
      { provide: FacturePdfService, useValue: { open } },
      {
        provide: AuthService,
        useValue: { isAdmin: signal(over.isAdmin ?? false), isComptable: signal(over.isComptable ?? false) },
      },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FactureDetailComponent);
  return {
    fixture,
    c: fixture.componentInstance,
    getFacture, getSoldeFacture, getPaiements, getEnvois, getAbonne, getCampagne, getDetteAbonne,
    annulerFacture, updateStatutFacture, envoyerFactureWhatsapp, renvoyerFactureWhatsapp,
    renvoyerEnvoi, envoyerRecuPaiement, navigate, open,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('FactureDetailComponent — chargement', () => {
  it('charge facture, solde, paiements et envois pour la facture de la route', async () => {
    const { fixture, c, getFacture } = monter();
    fixture.detectChanges();
    await flush();

    expect(getFacture).toHaveBeenCalledWith('f-1');
    expect(c.facture()?.numeroFacture).toBe('FACT-2026-08-0001');
    expect(c.loading()).toBe(false);
  });

  it('reste utilisable si abonné et campagne échouent à se résoudre', async () => {
    const { fixture, c } = monter({
      getAbonne: vi.fn().mockRejectedValue(new Error('refusé au COMPTABLE')),
      getCampagne: vi.fn().mockRejectedValue(new Error('indisponible')),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeNull();
    expect(c.abonne()).toBeNull();
    // Repli sur le nom enrichi porté par la facture elle-même.
    expect(c.abonneLabel()).toBe('Jean Dupont');
  });

  it('affiche le message serveur si la facture elle-même échoue à charger', async () => {
    const { fixture, c } = monter({
      getFacture: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Facture introuvable' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Facture introuvable');
  });

  it('ouvre automatiquement le formulaire de paiement depuis le lien « + Paiement » (Impayés)', async () => {
    const { fixture, c } = monter({
      queryParams: { paiement: '1' },
      getSoldeFacture: vi.fn().mockResolvedValue(solde({ soldeRestant: 5000 })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.showForm()).toBe(true);
  });

  it('n’ouvre pas le formulaire automatique sur une facture déjà soldée', async () => {
    const { fixture, c } = monter({
      queryParams: { paiement: '1' },
      getFacture: vi.fn().mockResolvedValue(facture({ statut: 'PAYEE' })),
      getSoldeFacture: vi.fn().mockResolvedValue(solde({ soldeRestant: 0, statut: 'PAYEE' })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.showForm()).toBe(false);
  });
});

describe('FactureDetailComponent — ce que l’abonné doit vraiment payer', () => {
  it('additionne la consommation du mois et le solde antérieur', async () => {
    const { fixture, c } = monter({ getDetteAbonne: vi.fn().mockResolvedValue({ totalDu: 3000, nbFactures: 1, plusAncienneEcheance: '2026-06-01' }) });
    fixture.detectChanges();
    await flush();
    expect(c.soldeAnterieur()?.totalDu).toBe(3000);
    expect(c.totalAPayer()).toBe(13_000); // 10 000 + 3 000
  });

  it('déduit l’avoir déjà imputé', async () => {
    const { fixture, c } = monter({ getSoldeFacture: vi.fn().mockResolvedValue(solde({ avoirImpute: 4000 })) });
    fixture.detectChanges();
    await flush();
    expect(c.avoirImpute()).toBe(4000);
    expect(c.aUnAvoir()).toBe(true);
    expect(c.totalAPayer()).toBe(6000); // 10 000 - 4 000
  });

  it('ne descend jamais sous zéro, même avec un avoir supérieur à la facture', async () => {
    const { fixture, c } = monter({ getSoldeFacture: vi.fn().mockResolvedValue(solde({ avoirImpute: 99_000 })) });
    fixture.detectChanges();
    await flush();
    expect(c.totalAPayer()).toBe(0);
  });

  it('masque le solde antérieur à zéro (pas de ligne de bruit)', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.aUnSoldeAnterieur()).toBe(false);
  });

  it('soldeAnterieurEchu est faux pour une échéance dans le futur', async () => {
    const futur = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({
      getDetteAbonne: vi.fn().mockResolvedValue({ totalDu: 3000, nbFactures: 1, plusAncienneEcheance: futur }),
    });
    fixture.detectChanges();
    await flush();
    expect(c.soldeAnterieurEchu()).toBe(false);
  });

  it('soldeAnterieurEchu est vrai pour une échéance passée', async () => {
    const passe = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({
      getDetteAbonne: vi.fn().mockResolvedValue({ totalDu: 3000, nbFactures: 1, plusAncienneEcheance: passe }),
    });
    fixture.detectChanges();
    await flush();
    expect(c.soldeAnterieurEchu()).toBe(true);
  });

  it('ne bloque pas l’affichage si le solde antérieur échoue à charger', async () => {
    const { fixture, c } = monter({ getDetteAbonne: vi.fn().mockRejectedValue(new Error('Paiement service down')) });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeNull();
    expect(c.soldeAnterieur()).toBeNull();
  });
});

describe('FactureDetailComponent — statut : le solde backend fait foi', () => {
  it('statutCoherent vaut IMPAYEE sans aucun versement', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.statutCoherent()).toBe('IMPAYEE');
  });

  it('statutCoherent vaut PAYEE quand le solde est nul malgré un statut IMPAYEE affiché', async () => {
    const { fixture, c } = monter({
      getFacture: vi.fn().mockResolvedValue(facture({ statut: 'IMPAYEE' })),
      getSoldeFacture: vi.fn().mockResolvedValue(solde({ montantPaye: 10_000, soldeRestant: 0 })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.statutCoherent()).toBe('PAYEE');
    expect(c.canAddPaiement()).toBe(false); // plus rien à régler, quoi que dise le statut
  });

  it('signale une correction manuelle incohérente avec le solde réel', async () => {
    const { fixture, c } = monter({ getSoldeFacture: vi.fn().mockResolvedValue(solde({ montantPaye: 0, soldeRestant: 10_000 })) });
    fixture.detectChanges();
    await flush();
    c.newStatut.set('PAYEE'); // contredit le solde encore entièrement dû
    expect(c.statutCorrectionIncoherent()).toBe(true);
    expect(c.statutIncoherentMsg()).toBeTruthy();
  });

  it('n’est pas incohérent quand la correction rejoint le solde réel', async () => {
    const { fixture, c } = monter({ getSoldeFacture: vi.fn().mockResolvedValue(solde({ montantPaye: 10_000, soldeRestant: 0 })) });
    fixture.detectChanges();
    await flush();
    c.newStatut.set('PAYEE');
    expect(c.statutCorrectionIncoherent()).toBe(false);
  });

  it('corrigerStatut exige un premier clic de confirmation avant d’agir', async () => {
    const { fixture, c, updateStatutFacture } = monter({ getSoldeFacture: vi.fn().mockResolvedValue(solde({ montantPaye: 10_000, soldeRestant: 0 })) });
    fixture.detectChanges();
    await flush();
    c.newStatut.set('PAYEE');

    await c.corrigerStatut(); // 1er clic : arme la confirmation
    expect(c.confirmationCorrection()).toBe(true);
    expect(updateStatutFacture).not.toHaveBeenCalled();

    await c.corrigerStatut(); // 2e clic : applique
    expect(updateStatutFacture).toHaveBeenCalledWith('f-1', 'PAYEE');
    expect(c.confirmationCorrection()).toBe(false);
  });

  it('refuse d’appliquer une correction incohérente avec le solde', async () => {
    const { fixture, c, updateStatutFacture } = monter();
    fixture.detectChanges();
    await flush();
    c.newStatut.set('PAYEE'); // solde encore entièrement dû : incohérent
    c.confirmationCorrection.set(true); // même en 2e clic
    await c.corrigerStatut();
    expect(updateStatutFacture).not.toHaveBeenCalled();
  });

  it('ne fait rien si le statut choisi est déjà le statut actuel', async () => {
    const { fixture, c, updateStatutFacture } = monter();
    fixture.detectChanges();
    await flush();
    c.newStatut.set('IMPAYEE'); // déjà le statut de la facture
    await c.corrigerStatut();
    expect(updateStatutFacture).not.toHaveBeenCalled();
  });
});

describe('FactureDetailComponent — droits d’administration', () => {
  it('peutAnnulerPaiement est vrai pour ADMIN', async () => {
    const { fixture, c } = monter({ isAdmin: true });
    fixture.detectChanges();
    await flush();
    expect(c.peutAnnulerPaiement()).toBe(true);
  });

  it('peutAnnulerPaiement est vrai pour COMPTABLE', async () => {
    const { fixture, c } = monter({ isComptable: true });
    fixture.detectChanges();
    await flush();
    expect(c.peutAnnulerPaiement()).toBe(true);
  });

  it('peutAnnulerPaiement est faux pour un agent', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.peutAnnulerPaiement()).toBe(false);
  });
});

describe('FactureDetailComponent — panneau d’annulation d’un paiement', () => {
  it('ouvre le panneau avec le paiement ciblé', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    const p = paiement({ paiementId: 'p-9' });
    c.ouvrirAnnulationPaiement(p);
    expect(c.annulPaiementOuverte()).toBe(true);
    expect(c.paiementAAnnuler()?.paiementId).toBe('p-9');
  });

  it('ferme le panneau et vide la sélection', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.ouvrirAnnulationPaiement(paiement());
    c.fermerAnnulationPaiement();
    expect(c.annulPaiementOuverte()).toBe(false);
    expect(c.paiementAAnnuler()).toBeNull();
  });

  it('recharge la facture après annulation d’un paiement', async () => {
    const { fixture, c, getFacture } = monter();
    fixture.detectChanges();
    await flush();
    getFacture.mockClear();
    c.ouvrirAnnulationPaiement(paiement());
    await c.onPaiementAnnule();
    expect(getFacture).toHaveBeenCalledWith('f-1');
    expect(c.annulPaiementOuverte()).toBe(false);
  });
});

describe('FactureDetailComponent — reçu de paiement', () => {
  it('envoie le reçu avec les identifiants exacts', async () => {
    const { fixture, c, envoyerRecuPaiement } = monter();
    fixture.detectChanges();
    await flush();
    await c.envoyerRecuPourPaiement(paiement({ paiementId: 'p-7' }));
    expect(envoyerRecuPaiement).toHaveBeenCalledWith('p-7', 'f-1', 'ab-1');
    expect(c.envoiRecuEnCours()).toBeNull();
  });

  it('n’autorise qu’un envoi de reçu à la fois', async () => {
    let resolve!: () => void;
    const enVol = new Promise<void>((r) => (resolve = () => r()));
    const { fixture, c, envoyerRecuPaiement } = monter();
    fixture.detectChanges();
    await flush();
    (envoyerRecuPaiement as ReturnType<typeof vi.fn>).mockReturnValue(enVol);

    const p1 = c.envoyerRecuPourPaiement(paiement({ paiementId: 'p-1' }));
    const p2 = c.envoyerRecuPourPaiement(paiement({ paiementId: 'p-2' })); // no-op
    resolve();
    await Promise.all([p1, p2]);

    expect(envoyerRecuPaiement).toHaveBeenCalledTimes(1);
    expect(envoyerRecuPaiement).toHaveBeenCalledWith('p-1', 'f-1', 'ab-1');
  });
});

describe('FactureDetailComponent — envoi WhatsApp', () => {
  it('premier envoi quand le journal est vide', async () => {
    const { fixture, c, envoyerFactureWhatsapp, renvoyerFactureWhatsapp } = monter();
    fixture.detectChanges();
    await flush();
    await c.envoyerWhatsapp();
    expect(envoyerFactureWhatsapp).toHaveBeenCalledWith('f-1', 'ab-1');
    expect(renvoyerFactureWhatsapp).not.toHaveBeenCalled();
  });

  it('renvoi quand un envoi existe déjà', async () => {
    const { fixture, c, envoyerFactureWhatsapp, renvoyerFactureWhatsapp } = monter({
      getEnvois: vi.fn().mockResolvedValue([envoi()]),
    });
    fixture.detectChanges();
    await flush();
    await c.envoyerWhatsapp();
    expect(renvoyerFactureWhatsapp).toHaveBeenCalledWith('f-1');
    expect(envoyerFactureWhatsapp).not.toHaveBeenCalled();
  });

  it('le libellé du bouton change selon l’historique', async () => {
    const { fixture, c } = monter({ getEnvois: vi.fn().mockResolvedValue([envoi()]) });
    fixture.detectChanges();
    await flush();
    expect(c.waButtonLabel()).toContain('BTN_RENVOYER_WA');
  });

  it('rejouerEnvoi ne permet qu’un renvoi à la fois', async () => {
    let resolve!: () => void;
    const enVol = new Promise<void>((r) => (resolve = () => r()));
    const { fixture, c, renvoyerEnvoi } = monter();
    fixture.detectChanges();
    await flush();
    (renvoyerEnvoi as ReturnType<typeof vi.fn>).mockReturnValue(enVol);

    const p1 = c.rejouerEnvoi('e-1');
    const p2 = c.rejouerEnvoi('e-2');
    resolve();
    await Promise.all([p1, p2]);

    expect(renvoyerEnvoi).toHaveBeenCalledTimes(1);
    expect(renvoyerEnvoi).toHaveBeenCalledWith('e-1');
  });
});

describe('FactureDetailComponent — après une annulation', () => {
  it('suit la nouvelle facture régénérée, sous /factures', async () => {
    const { fixture, c, navigate } = monter();
    fixture.detectChanges();
    await flush();
    await c.onAnnulationFaite({ factureId: 'f-2' });
    expect(navigate).toHaveBeenCalledWith(['/factures', 'f-2']);
  });

  it('recharge sur place sans régénération', async () => {
    const { fixture, c, getFacture, navigate } = monter();
    fixture.detectChanges();
    await flush();
    getFacture.mockClear();
    await c.onAnnulationFaite(null);
    expect(navigate).not.toHaveBeenCalled();
    expect(getFacture).toHaveBeenCalledWith('f-1');
  });
});

describe('FactureDetailComponent — navigation et présentation', () => {
  it('backLink pointe vers la campagne de la facture', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.backLink()).toBe('/factures/campagne/camp-1');
  });

  it('backLink retombe sur le tableau de bord sans campagne', async () => {
    const { fixture, c } = monter({ getFacture: vi.fn().mockResolvedValue(facture({ campagneId: '' })) });
    fixture.detectChanges();
    await flush();
    expect(c.backLink()).toBe('/dashboard');
  });

  it('compose le sous-titre mobile avec nom et numéro d’abonné', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.topbarSubtitle()).toBe('Jean Dupont · AB-0001');
  });

  it('formatDate renvoie un tiret pour une date vide', () => {
    const { c } = monter();
    expect(c.formatDate('')).toBe('—');
  });

  it('goBack navigue vers backLink()', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    const router = TestBed.inject(Router) as unknown as { navigateByUrl: ReturnType<typeof vi.fn> };
    c.goBack();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/factures/campagne/camp-1');
  });
});

describe('FactureDetailComponent — PDF', () => {
  it('ouvre le PDF avec un nom de fichier basé sur le numéro de facture', async () => {
    const { fixture, c, open } = monter();
    fixture.detectChanges();
    await flush();
    await c.openPdf();
    expect(open).toHaveBeenCalledWith('f-1', 'facture-FACT-2026-08-0001.pdf');
  });

  it('affiche une erreur dédiée si le PDF échoue', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    const openSpy = vi.fn().mockRejectedValue(new Error('503'));
    (TestBed.inject(FacturePdfService) as unknown as { open: typeof openSpy }).open = openSpy;
    await c.openPdf();
    expect(toast.error).toHaveBeenCalled();
    expect(c.pdfLoading()).toBe(false);
  });
});

/**
 * Le bandeau d'annulation, dans le DOM — pas seulement dans les signaux.
 *
 * C'est exactement le champ que `graphql/vues.ts` documente comme ayant vécu
 * plusieurs versions sans jamais s'afficher : un modèle écrit à la main
 * déclarait `motifAnnulation` optionnel, la requête ne le demandait pas, et le
 * gabarit compilait quand même sur une valeur toujours `undefined`. Le seul
 * test qui aurait pu l'attraper est un test qui lit le DOM produit par la vraie
 * vue `FactureDetail` — c'est celui-ci.
 */
describe('FactureDetailComponent — bandeau d’annulation (rendu réel)', () => {
  it('affiche le motif exact d’une facture annulée', async () => {
    const { fixture } = monter({
      getFacture: vi.fn().mockResolvedValue(
        facture({ statut: 'ANNULEE', motifAnnulation: 'Index du mauvais compteur', annuleePar: 'admin1' }),
      ),
      getSoldeFacture: vi.fn().mockResolvedValue(solde({ montantPaye: 0, soldeRestant: 0, statut: 'ANNULEE' })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.annulee-bandeau')).toBeTruthy();
    expect(racine.querySelector('.annulee-bandeau__motif')?.textContent).toContain('Index du mauvais compteur');
  });

  it('n’affiche aucun bandeau pour une facture normale', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.annulee-bandeau')).toBeNull();
  });

  it('le bouton d’annulation n’apparaît qu’à un ADMIN, jamais sur une facture déjà annulée', async () => {
    const { fixture } = monter({ isAdmin: true });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.btn--danger-ghost')).toBeTruthy();
  });

  it('le bouton d’annulation reste caché à qui n’est pas ADMIN', async () => {
    const { fixture } = monter({ isAdmin: false, isComptable: true });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.btn--danger-ghost')).toBeNull();
  });
});
