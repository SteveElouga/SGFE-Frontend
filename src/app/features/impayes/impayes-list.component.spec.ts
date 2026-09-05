import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { ImpayesListComponent } from './impayes-list.component';
import { FacturesService } from '../../core/factures/factures.service';
import { ToastService } from '../../shared/services/toast.service';
import type { SoldeImpaye } from '../../graphql/vues';
import type { SuiviImpaye } from '../../shared/models/facture.model';

/**
 * Écran Impayés : agrégation solde + facture + abonné + suivi de relance, avec
 * repli sur l'échéance de la facture quand le suivi n'existe pas encore (cron
 * jamais passé pour cette créance — même défaut que sur l'historique des
 * relances). Ces tests portent sur cette résilience, sur le regroupement par
 * abonné (pas par facture — l'écran répond à « qui doit », pas « quelle
 * facture »), et sur les compteurs globaux qui ne doivent pas suivre le filtre.
 */
function solde(p: Partial<SoldeImpaye> = {}): SoldeImpaye {
  return {
    factureId: 'f-1',
    montantTotal: 10_000,
    montantPaye: 0,
    soldeRestant: 10_000,
    statut: 'IMPAYEE',
    abonneId: 'ab-1',
    dateLimitePaiement: '2026-07-01',
    ...p,
  } as SoldeImpaye;
}

// `abonneNom`/`abonneNumero` : résolus côté Gateway (`_enrichir_factures`,
// gateway/schema/facturation_queries.py), pas via une requête `abonnes`
// séparée — voir le commentaire de `load()` dans le composant.
function factureRef(
  p: Partial<{ factureId: string; numeroFacture: string; abonneId: string; abonneNom: string; abonneNumero: string }> = {},
) {
  return { factureId: 'f-1', numeroFacture: 'FACT-1', abonneId: 'ab-1', abonneNom: '', abonneNumero: '', ...p };
}

function suivi(p: Partial<SuiviImpaye> = {}): SuiviImpaye {
  return { suiviId: 's-1', factureId: 'f-1', abonneId: 'ab-1', dateDepassement: '2026-07-01', etapeActuelle: 1, resoluLe: '', ...p } as SuiviImpaye;
}

function monter(over: {
  getImpayes?: ReturnType<typeof vi.fn>;
  getFactures?: ReturnType<typeof vi.fn>;
  getAllPaiements?: ReturnType<typeof vi.fn>;
  getSuiviImpaye?: ReturnType<typeof vi.fn>;
} = {}) {
  const getImpayes = over.getImpayes ?? vi.fn().mockResolvedValue([]);
  const getFactures = over.getFactures ?? vi.fn().mockResolvedValue([]);
  const getAllPaiements = over.getAllPaiements ?? vi.fn().mockResolvedValue([]);
  const getSuiviImpaye = over.getSuiviImpaye ?? vi.fn().mockResolvedValue(suivi());

  TestBed.configureTestingModule({
    imports: [ImpayesListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: FacturesService, useValue: { getImpayes, getFactures, getAllPaiements, getSuiviImpaye } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      // Le composant lui-même n'injecte plus Apollo (voir load()) — ce stub
      // ne satisfait qu'une dépendance transitive plus profonde (NotificationsService
      // -> AuthService -> Apollo), jamais exercée par ces tests.
      { provide: Apollo, useValue: { query: vi.fn().mockReturnValue(of({ data: {} })), subscribe: () => of({}) } },
    ],
  });
  const fixture = TestBed.createComponent(ImpayesListComponent);
  return { fixture, c: fixture.componentInstance };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('ImpayesListComponent — agrégation', () => {
  it('assemble solde et facture (abonné déjà résolu côté Gateway) pour composer chaque ligne', async () => {
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde()]),
      getFactures: vi.fn().mockResolvedValue([factureRef({ abonneNom: 'Jean Dupont', abonneNumero: 'AB-0001' })]),
    });
    fixture.detectChanges();
    await flush();

    const row = c.impayes()[0];
    expect(row.abonneNom).toBe('Jean Dupont');
    expect(row.numeroAbonne).toBe('AB-0001');
    expect(row.numeroFacture).toBe('FACT-1');
  });

  it('affiche « — » pour un abonné non résolu, sans planter', async () => {
    const { fixture, c } = monter({ getImpayes: vi.fn().mockResolvedValue([solde()]) });
    fixture.detectChanges();
    await flush();
    expect(c.impayes()[0].abonneNom).toBe('—');
  });

  it('retombe sur l’échéance de la facture quand le suivi n’a pas encore tourné', async () => {
    const dateLimite = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde({ dateLimitePaiement: dateLimite })]),
      getSuiviImpaye: vi.fn().mockRejectedValue(new Error('404')),
    });
    fixture.detectChanges();
    await flush();
    expect(c.impayes()[0].retardJours).toBe(31);
    expect(c.impayes()[0].etapeActuelle).toBeNull();
  });

  it('affiche une erreur en cas d’échec du chargement', async () => {
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Paiement indisponible' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Paiement indisponible');
  });
});

describe('ImpayesListComponent — pause post-acompte', () => {
  it('marque en pause un solde partiel réglé récemment', async () => {
    const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde({ montantPaye: 3000, soldeRestant: 7000 })]),
      getAllPaiements: vi.fn().mockResolvedValue([{ factureId: 'f-1', datePaiement: recent }]),
    });
    fixture.detectChanges();
    await flush();
    expect(c.impayes()[0].enPause).toBe(true);
  });

  it('ne met pas en pause un acompte trop ancien', async () => {
    const vieux = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde({ montantPaye: 3000, soldeRestant: 7000 })]),
      getAllPaiements: vi.fn().mockResolvedValue([{ factureId: 'f-1', datePaiement: vieux }]),
    });
    fixture.detectChanges();
    await flush();
    expect(c.impayes()[0].enPause).toBe(false);
  });
});

describe('ImpayesListComponent — regroupement par abonné', () => {
  it('regroupe plusieurs factures du même abonné en une seule ligne', async () => {
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([
        solde({ factureId: 'f-1', abonneId: 'ab-1', soldeRestant: 5000 }),
        solde({ factureId: 'f-2', abonneId: 'ab-1', soldeRestant: 3000 }),
      ]),
      getFactures: vi.fn().mockResolvedValue([factureRef({ factureId: 'f-1' }), factureRef({ factureId: 'f-2', numeroFacture: 'FACT-2' })]),
    });
    fixture.detectChanges();
    await flush();

    const groupes = c.groupesAbonnes();
    expect(groupes).toHaveLength(1);
    expect(groupes[0].nbFactures).toBe(2);
    expect(groupes[0].totalDu).toBe(8000);
  });

  it('trie les abonnés du retard le plus important au plus faible', async () => {
    const ancien = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([
        solde({ factureId: 'f-1', abonneId: 'ab-1', dateLimitePaiement: recent }),
        solde({ factureId: 'f-2', abonneId: 'ab-2', dateLimitePaiement: ancien }),
      ]),
      getFactures: vi.fn().mockResolvedValue([
        factureRef({ factureId: 'f-1', abonneId: 'ab-1' }),
        factureRef({ factureId: 'f-2', abonneId: 'ab-2' }),
      ]),
      getSuiviImpaye: vi.fn().mockRejectedValue(new Error('404')),
    });
    fixture.detectChanges();
    await flush();

    expect(c.groupesAbonnes().map((g) => g.abonneId)).toEqual(['ab-2', 'ab-1']);
  });
});

describe('ImpayesListComponent — filtres, tri et KPI', () => {
  const soldes = [
    solde({ factureId: 'f-1', abonneId: 'ab-1', soldeRestant: 5000 }),
    solde({ factureId: 'f-2', abonneId: 'ab-2', soldeRestant: 9000 }),
  ];
  const suivis = [suivi({ factureId: 'f-1', etapeActuelle: 1 }), suivi({ factureId: 'f-2', etapeActuelle: 4 })];

  function creer() {
    const getSuiviImpaye = vi.fn((id: string) => Promise.resolve(suivis.find((s) => s.factureId === id) ?? null));
    return monter({
      getImpayes: vi.fn().mockResolvedValue(soldes),
      getFactures: vi.fn().mockResolvedValue([factureRef({ factureId: 'f-1', abonneId: 'ab-1' }), factureRef({ factureId: 'f-2', abonneId: 'ab-2', numeroFacture: 'FACT-2' })]),
      getSuiviImpaye,
    });
  }

  it('filtre par étape', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onEtapeChange(4);
    expect(c.impayesFiltres().map((i) => i.factureId)).toEqual(['f-2']);
  });

  it('trie par solde quand demandé', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onTriChange('SOLDE');
    expect(c.impayesFiltres().map((i) => i.factureId)).toEqual(['f-2', 'f-1']);
  });

  it('recherche par nom, numéro ou facture', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onSearchChange('FACT-2');
    expect(c.impayesFiltres()).toHaveLength(1);
  });

  it('les KPI portent sur l’ensemble, pas la vue filtrée', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onEtapeChange(4);
    expect(c.nbImpayes()).toBe(2);
    expect(c.totalSolde()).toBe(14000);
    expect(c.nbSuspendues()).toBe(1);
  });

  it('badgeState reflète la suspension avant toute autre étape', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    const ligne = c.impayes().find((i) => i.factureId === 'f-2')!;
    expect(c.badgeState(ligne)).toBe('suspendue');
  });
});

describe('ImpayesListComponent — export CSV', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('avertit sans exporter quand la vue filtrée est vide', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { info: ReturnType<typeof vi.fn> };
    c.exportBilan();
    expect(toast.info).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('exporte un CSV quand des lignes sont présentes', async () => {
    const { fixture, c } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde()]),
      getFactures: vi.fn().mockResolvedValue([factureRef()]),
    });
    fixture.detectChanges();
    await flush();
    c.exportBilan();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
