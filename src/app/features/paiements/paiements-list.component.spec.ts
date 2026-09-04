import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { Subject, of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { PaiementsListComponent } from './paiements-list.component';
import { FacturesService } from '../../core/factures/factures.service';
import { ToastService } from '../../shared/services/toast.service';
import type { GetAllPaiementsQuery } from '../../graphql/generated';

/**
 * Journal de caisse : liste des paiements enrichis par facture (abonné,
 * campagne, statut), avec le total encaissé qui doit EXCLURE les paiements
 * annulés (PRODUCT.md « Exactitude financière visible »), et la mise à jour
 * en direct d'un encaissement créé ailleurs pendant que l'écran est ouvert.
 */
type Paiement = GetAllPaiementsQuery['paiements'][number];

function paiement(p: Partial<Paiement> = {}): Paiement {
  return {
    paiementId: 'p-1',
    factureId: 'f-1',
    montant: 5000,
    datePaiement: '2026-08-01',
    modePaiement: 'ESPECES',
    referenceTransaction: '',
    createdAt: '2026-08-01',
    annule: false,
    annuleLe: '',
    annulePar: '',
    motifAnnulation: '',
    ...p,
  } as Paiement;
}

function facture(p: Partial<{ factureId: string; numeroFacture: string; abonneId: string; abonneNom: string; abonneNumero: string; campagneId: string; campagneNom: string; campagnePeriodeMois: number; campagnePeriodeAnnee: number; statut: string }> = {}) {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-1',
    abonneId: 'ab-1',
    abonneNom: 'Jean Dupont',
    abonneNumero: 'AB-0001',
    campagneId: 'camp-1',
    campagneNom: 'Août 2026',
    campagnePeriodeMois: 8,
    campagnePeriodeAnnee: 2026,
    statut: 'PARTIELLE',
    ...p,
  };
}

function monter(over: {
  getAllPaiements?: ReturnType<typeof vi.fn>;
  getFactures?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
  const getAllPaiements = over.getAllPaiements ?? vi.fn().mockResolvedValue([]);
  const getFactures = over.getFactures ?? vi.fn().mockResolvedValue([]);
  const subscribe = over.subscribe ?? vi.fn().mockReturnValue(of({ data: {} }));

  TestBed.configureTestingModule({
    imports: [PaiementsListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: FacturesService, useValue: { getAllPaiements, getFactures } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Apollo, useValue: { subscribe, query: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PaiementsListComponent);
  return { fixture, c: fixture.componentInstance };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('PaiementsListComponent — chargement', () => {
  it('résout abonné, numéro de facture et campagne depuis les libellés enrichis', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();

    const row = c.rows()[0];
    expect(row.abonneNom).toBe('Jean Dupont');
    expect(row.numeroFacture).toBe('FACT-1');
    expect(row.statutFacture).toBe('PARTIELLE');
    // La campagne du seul paiement présent est présélectionnée.
    expect(c.selectedCampagneId()).toBe('camp-1');
  });

  it('reste consultable si les factures ne chargent pas', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockRejectedValue(new Error('indisponible')),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeNull();
    expect(c.rows()).toHaveLength(1);
    expect(c.rows()[0].numeroFacture).toBe('—');
  });

  it('affiche l’erreur serveur si les paiements eux-mêmes échouent', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Service indisponible' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Service indisponible');
  });
});

describe('PaiementsListComponent — total encaissé exclut les annulés', () => {
  it('un paiement annulé ne compte ni dans le total ni ailleurs que dans son propre compteur', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', montant: 5000, annule: false }),
        paiement({ paiementId: 'p-2', montant: 2000, annule: true }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null); // pas de filtre campagne : les deux lignes comptent

    expect(c.totalMontant()).toBe(5000);
    expect(c.nbAnnules()).toBe(1);
    expect(c.montantAnnule()).toBe(2000);
  });
});

describe('PaiementsListComponent — filtres', () => {
  function creer() {
    return monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', modePaiement: 'ESPECES', datePaiement: '2026-08-01' }),
        paiement({ paiementId: 'p-2', factureId: 'f-2', modePaiement: 'MOBILE_MONEY', datePaiement: '2026-08-15' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([
        facture({ factureId: 'f-1', campagneId: 'camp-1' }),
        facture({ factureId: 'f-2', campagneId: 'camp-2', campagneNom: 'Septembre 2026', campagnePeriodeMois: 9 }),
      ]),
    });
  }

  it('filtre par campagne', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange('camp-2');
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('filtre par mode de paiement', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onModeChange('MOBILE_MONEY');
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('filtre par plage de dates', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onDateRangeChange([new Date('2026-08-10'), new Date('2026-08-31')]);
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('recherche par nom d’abonné', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onSearchChange('dupont');
    expect(c.rows()).toHaveLength(2); // les deux factures portent « Jean Dupont »
  });
});

describe('PaiementsListComponent — paiement créé en direct', () => {
  it('insère un nouveau paiement en tête du journal', async () => {
    const evenements = new Subject<{ data: { paiementCree: Partial<Paiement> } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    evenements.next({
      data: {
        paiementCree: {
          paiementId: 'p-live',
          factureId: 'f-9',
          montant: 1000,
          datePaiement: '2026-08-20',
          modePaiement: 'ESPECES',
          referenceTransaction: '',
        },
      },
    });

    expect(c.paiements()[0].paiementId).toBe('p-live');
    expect(c.paiements()[0].annule).toBe(false);
  });

  it('ignore un doublon (même paiementId déjà présent)', async () => {
    const evenements = new Subject<{ data: { paiementCree: Partial<Paiement> } }>();
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement({ paiementId: 'p-1' })]),
      subscribe: vi.fn().mockReturnValue(evenements),
    });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { paiementCree: { paiementId: 'p-1', factureId: 'f-1', montant: 5000, datePaiement: '2026-08-01', modePaiement: 'ESPECES', referenceTransaction: '' } } });

    expect(c.paiements()).toHaveLength(1);
  });
});

describe('PaiementsListComponent — libellés de statut', () => {
  it('statutLabel affiche « — » sans statut connu', async () => {
    const { c } = monter();
    expect(c.statutLabel({ statutFacture: null } as never)).toBe('—');
  });

  it('statutTone associe warning à une facture partielle', async () => {
    const { c } = monter();
    expect(c.statutTone({ statutFacture: 'PARTIELLE' } as never)).toBe('warning');
    expect(c.statutTone({ statutFacture: 'PAYEE' } as never)).toBe('success');
    expect(c.statutTone({ statutFacture: 'IMPAYEE' } as never)).toBe('neutral');
  });
});

describe('PaiementsListComponent — export CSV', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('avertit sans exporter si la vue filtrée est vide', () => {
    const { c } = monter();
    const toast = TestBed.inject(ToastService) as unknown as { info: ReturnType<typeof vi.fn> };
    c.exportCSV();
    expect(toast.info).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('exporte un CSV quand des lignes existent', async () => {
    const { fixture, c } = monter({ getAllPaiements: vi.fn().mockResolvedValue([paiement()]) });
    fixture.detectChanges();
    await flush();
    c.exportCSV();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
