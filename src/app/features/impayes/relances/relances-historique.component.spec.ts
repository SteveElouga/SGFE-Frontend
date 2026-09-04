import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { RelancesHistoriqueComponent } from './relances-historique.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AbonneDetail, CampagneDetail, FactureDetail, SoldeDetail } from '../../../graphql/vues';
import type { SuiviImpaye } from '../../../shared/models/facture.model';

// `<app-page-topbar>` embarque la cloche de notifications, dont le service
// racine injecte `AuthService`, qui injecte `Apollo` — nécessaire même si ce
// composant ne fait lui-même aucun appel Apollo direct.
const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };

/**
 * Historique des relances d'une facture impayée : timeline des quatre étapes,
 * calcul du retard (source unique : la date limite de la facture, pas le
 * suivi — voir le commentaire du composant sur les factures jamais reprises
 * par le cron), et renvoi manuel avec cooldown anti double-envoi.
 */
function facture(p: Partial<FactureDetail> = {}): FactureDetail {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-1',
    abonneId: 'ab-1',
    campagneId: 'camp-1',
    montant: 10_000,
    dateLimitePaiement: '2026-07-01',
    ...p,
  } as FactureDetail;
}

function solde(p: Partial<SoldeDetail> = {}): SoldeDetail {
  return { montantTotal: 10_000, montantPaye: 0, soldeRestant: 10_000, ...p } as SoldeDetail;
}

function suivi(p: Partial<SuiviImpaye> = {}): SuiviImpaye {
  return {
    suiviId: 's-1',
    factureId: 'f-1',
    abonneId: 'ab-1',
    dateDepassement: '2026-07-01',
    etapeActuelle: 2,
    resoluLe: '',
    ...p,
  } as SuiviImpaye;
}

function abonne(p: Partial<AbonneDetail> = {}): AbonneDetail {
  return { id: 'ab-1', nom: 'Dupont', prenom: 'Jean', numeroAbonne: 'AB-0001' } as AbonneDetail;
}

function campagne(p: Partial<CampagneDetail> = {}): CampagneDetail {
  return { campagneId: 'camp-1', nom: 'Août 2026', periodeMois: 8, periodeAnnee: 2026 } as CampagneDetail;
}

function monter(over: {
  getFacture?: ReturnType<typeof vi.fn>;
  getSoldeFacture?: ReturnType<typeof vi.fn>;
  getSuiviImpaye?: ReturnType<typeof vi.fn>;
  getAbonne?: ReturnType<typeof vi.fn>;
  getCampagne?: ReturnType<typeof vi.fn>;
  renvoyerFactureWhatsapp?: ReturnType<typeof vi.fn>;
} = {}) {
  const getFacture = over.getFacture ?? vi.fn().mockResolvedValue(facture());
  const getSoldeFacture = over.getSoldeFacture ?? vi.fn().mockResolvedValue(solde());
  const getSuiviImpaye = over.getSuiviImpaye ?? vi.fn().mockResolvedValue(suivi());
  const renvoyerFactureWhatsapp = over.renvoyerFactureWhatsapp ?? vi.fn().mockResolvedValue({});
  const getAbonne = over.getAbonne ?? vi.fn().mockResolvedValue(abonne());
  const getCampagne = over.getCampagne ?? vi.fn().mockResolvedValue(campagne());

  TestBed.configureTestingModule({
    imports: [RelancesHistoriqueComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { params: { factureId: 'f-1' } } } },
      { provide: FacturesService, useValue: { getFacture, getSoldeFacture, getSuiviImpaye, renvoyerFactureWhatsapp } },
      { provide: AbonnesService, useValue: { getAbonne } },
      { provide: CampagnesService, useValue: { getCampagne } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Apollo, useValue: apolloStub },
    ],
  });
  const fixture = TestBed.createComponent(RelancesHistoriqueComponent);
  return { fixture, c: fixture.componentInstance, renvoyerFactureWhatsapp };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('RelancesHistoriqueComponent — chargement', () => {
  it('charge facture, solde, suivi, abonné et campagne', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();

    expect(c.facture()?.factureId).toBe('f-1');
    expect(c.abonneNom()).toBe('Jean Dupont');
    expect(c.numeroAbonne()).toBe('AB-0001');
    expect(c.loading()).toBe(false);
  });

  it('affiche le message serveur en cas d’échec', async () => {
    const { fixture, c } = monter({
      getFacture: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Facture introuvable' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Facture introuvable');
  });

  it('n’échoue pas si le suivi n’existe pas encore (cron jamais passé)', async () => {
    const { fixture, c } = monter({ getSuiviImpaye: vi.fn().mockRejectedValue(new Error('404')) });
    fixture.detectChanges();
    await flush();
    expect(c.suivi()).toBeNull();
    expect(c.etapeActuelle()).toBe(0);
    expect(c.error()).toBeNull();
  });
});

describe('RelancesHistoriqueComponent — retard, source unique', () => {
  it('calcule le retard depuis la date limite de la facture', async () => {
    const dateLimite = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({ getFacture: vi.fn().mockResolvedValue(facture({ dateLimitePaiement: dateLimite })) });
    fixture.detectChanges();
    await flush();
    expect(c.retardJours()).toBe(5);
  });

  it('retombe sur la date de dépassement du suivi si la facture n’en a pas', async () => {
    const dateDepassement = new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({
      getFacture: vi.fn().mockResolvedValue(facture({ dateLimitePaiement: '' })),
      getSuiviImpaye: vi.fn().mockResolvedValue(suivi({ dateDepassement })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.retardJours()).toBe(9);
  });

  it('estSuspendu est vrai à partir de l’étape 4', async () => {
    const { fixture, c } = monter({ getSuiviImpaye: vi.fn().mockResolvedValue(suivi({ etapeActuelle: 4 })) });
    fixture.detectChanges();
    await flush();
    expect(c.estSuspendu()).toBe(true);
  });
});

describe('RelancesHistoriqueComponent — timeline des étapes', () => {
  it('marque comme faites les étapes jusqu’à l’étape courante, pas au-delà', async () => {
    const { fixture, c } = monter({ getSuiviImpaye: vi.fn().mockResolvedValue(suivi({ etapeActuelle: 2 })) });
    fixture.detectChanges();
    await flush();

    const done = c.steps().filter((s) => s.done).map((s) => s.numero);
    expect(done).toEqual([1, 2]);
  });

  it('la dernière étape franchie alimente l’aperçu de renvoi', async () => {
    const { fixture, c } = monter({ getSuiviImpaye: vi.fn().mockResolvedValue(suivi({ etapeActuelle: 2 })) });
    fixture.detectChanges();
    await flush();
    expect(c.renvoiPreviewTitle()).toBeTruthy();
  });
});

describe('RelancesHistoriqueComponent — renvoi manuel', () => {
  it('ouvre la confirmation avant tout envoi', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.openConfirmRenvoi();
    expect(c.renvoiConfirmOpen()).toBe(true);
  });

  it('refuse d’ouvrir la confirmation pendant le cooldown', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.renvoiCooldown.set(30);
    c.openConfirmRenvoi();
    expect(c.renvoiConfirmOpen()).toBe(false);
  });

  it('confirmRenvoi envoie, ferme la sheet et arme le cooldown', async () => {
    const { fixture, c, renvoyerFactureWhatsapp } = monter();
    fixture.detectChanges();
    await flush();
    c.openConfirmRenvoi();

    await c.confirmRenvoi();

    expect(renvoyerFactureWhatsapp).toHaveBeenCalledWith('f-1');
    expect(c.renvoiConfirmOpen()).toBe(false);
    expect(c.renvoiCooldown()).toBeGreaterThan(0);
  });

  it('affiche l’erreur serveur sans fermer la sheet si l’envoi échoue', async () => {
    const { fixture, c } = monter({
      renvoyerFactureWhatsapp: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'Numéro invalide' }]),
      ),
    });
    fixture.detectChanges();
    await flush();
    c.openConfirmRenvoi();
    await c.confirmRenvoi();

    expect(c.renvoiConfirmOpen()).toBe(true); // reste ouverte : l'utilisateur voit l'erreur
    expect(c.renvoi()).toBe(false);
  });

  it('n’annule pas la confirmation en cours d’envoi', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.openConfirmRenvoi();
    c.renvoi.set(true);
    c.cancelConfirmRenvoi();
    expect(c.renvoiConfirmOpen()).toBe(true);
  });

  it('enregistrerPaiement navigue vers la facture avec le paramètre d’ouverture directe', async () => {
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [RelancesHistoriqueComponent],
      providers: [
        provideTranslateService({}),
        { provide: Router, useValue: { navigate, createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: { factureId: 'f-1' } } } },
        { provide: FacturesService, useValue: { getFacture: vi.fn().mockResolvedValue(facture()), getSoldeFacture: vi.fn().mockResolvedValue(solde()), getSuiviImpaye: vi.fn().mockResolvedValue(suivi()) } },
        { provide: AbonnesService, useValue: { getAbonne: vi.fn().mockResolvedValue(abonne()) } },
        { provide: CampagnesService, useValue: { getCampagne: vi.fn().mockResolvedValue(campagne()) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: apolloStub },
      ],
    });
    const fixture = TestBed.createComponent(RelancesHistoriqueComponent);
    fixture.detectChanges();
    await flush();

    fixture.componentInstance.enregistrerPaiement();
    expect(navigate).toHaveBeenCalledWith(['/factures', 'f-1'], { queryParams: { paiement: 1 } });
  });
});
