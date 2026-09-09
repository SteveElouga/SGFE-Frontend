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

  it('ne passe jamais par Apollo directement : régression du bogue réel « abonnes réservé ADMIN, appelé pour COMPTABLE »', async () => {
    // Bogue de production corrigé (voir le commentaire de `load()`) :
    // `impayes-list.component.ts` appelait la query `abonnes` (réservée
    // ADMIN côté gateway) dans un `Promise.all`, cassant silencieusement cet
    // écran pour tout COMPTABLE — rôle pourtant autorisé sur `/impayes`
    // (`roleGuard(['ADMIN', 'COMPTABLE'])`, app.routes.ts). La ligne vient
    // désormais entièrement de `FacturesService` ; ce test attrape toute
    // réintroduction d'un appel Apollo direct dans ce composant.
    const { fixture } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde()]),
      getFactures: vi.fn().mockResolvedValue([factureRef()]),
    });
    fixture.detectChanges();
    await flush();
    const apollo = TestBed.inject(Apollo) as unknown as { query: ReturnType<typeof vi.fn> };
    expect(apollo.query).not.toHaveBeenCalled();
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

/**
 * Rendu réel du template : les tests ci-dessus exercent `impayes()` /
 * `impayesFiltres()` / `groupesAbonnes()` via les signaux, mais aucun ne
 * rappelle `detectChanges()` après le chargement — ni la vue par abonné
 * (défaut), ni le tableau par facture, ni les badges d'étape/retard ne
 * s'affichaient donc jamais réellement.
 */
describe('ImpayesListComponent — rendu du template', () => {
  const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

  /** Jeu de 4 abonnés couvrant chaque état de badge visible + retard/paiement variés. */
  function creerJeuComplet() {
    const soldes = [
      solde({ factureId: 'f-1', abonneId: 'ab-1', soldeRestant: 5000, montantPaye: 0, dateLimitePaiement: ilYA(15) }),
      solde({ factureId: 'f-2', abonneId: 'ab-2', soldeRestant: 3000, montantPaye: 2000, dateLimitePaiement: ilYA(5) }),
      solde({ factureId: 'f-3', abonneId: 'ab-3', soldeRestant: 4000, montantPaye: 0, dateLimitePaiement: '' }),
      solde({ factureId: 'f-4', abonneId: 'ab-4', soldeRestant: 7000, montantPaye: 0, dateLimitePaiement: ilYA(20) }),
    ];
    const factures = soldes.map((s) =>
      factureRef({
        factureId: s.factureId,
        abonneId: s.abonneId!,
        numeroFacture: `FACT-${s.factureId}`,
        abonneNom: `Nom ${s.abonneId}`,
        abonneNumero: (s.abonneId ?? '').toUpperCase(),
      }),
    );
    const suivisMap: Record<string, SuiviImpaye | null> = {
      'f-1': suivi({ factureId: 'f-1', abonneId: 'ab-1', etapeActuelle: 1, dateDepassement: ilYA(15) }),
      'f-2': suivi({ factureId: 'f-2', abonneId: 'ab-2', etapeActuelle: 2, dateDepassement: ilYA(5) }),
      'f-3': suivi({ factureId: 'f-3', abonneId: 'ab-3', etapeActuelle: 3, dateDepassement: '' }),
      'f-4': suivi({ factureId: 'f-4', abonneId: 'ab-4', etapeActuelle: 4, dateDepassement: ilYA(20) }),
    };
    const getSuiviImpaye = vi.fn((id: string) => Promise.resolve(suivisMap[id] ?? null));
    return monter({
      getImpayes: vi.fn().mockResolvedValue(soldes),
      getFactures: vi.fn().mockResolvedValue(factures),
      getSuiviImpaye,
    });
  }

  it('affiche le bandeau d’erreur avec bouton « réessayer »', async () => {
    const getImpayes = vi.fn()
      .mockRejectedValueOnce(new CombinedGraphQLErrors({ data: null }, [{ message: 'Panne réseau' }]))
      .mockResolvedValue([]);
    const { fixture } = monter({ getImpayes });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.error-banner__message')?.textContent).toContain('Panne réseau');
    (racine.querySelector('.error-banner__retry') as HTMLButtonElement).click();
    await flush();
    expect(getImpayes).toHaveBeenCalledTimes(2);
  });

  it('rend la vue par abonné par défaut, avec et sans retard affiché', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelectorAll('.imp-groupe')).toHaveLength(4);
    // ab-3 n'a pas de retard connu : pas de mention « retard » sur sa ligne.
    const groupeAb3 = [...racine.querySelectorAll('.imp-groupe')].find((g) =>
      g.querySelector('.imp-groupe__ref')?.textContent === 'AB-3',
    );
    expect(groupeAb3?.querySelector('.imp-groupe__retard')).toBeNull();
    expect(groupeAb3?.querySelector('.imp-ligne__age')).toBeNull();
    // ab-1 a un retard important : la mention apparaît, sur le groupe et la ligne.
    const groupeAb1 = [...racine.querySelectorAll('.imp-groupe')].find((g) =>
      g.querySelector('.imp-groupe__ref')?.textContent === 'AB-1',
    );
    expect(groupeAb1?.querySelector('.imp-groupe__retard')).toBeTruthy();
    expect(groupeAb1?.querySelector('.imp-ligne__age')).toBeTruthy();
    // KPI : au moins une suspension (étape 4) affiche le sous-badge d'urgence.
    expect(racine.querySelector('.kpi__hint--danger')).toBeTruthy();
  });

  it('masque le sous-badge d’urgence quand aucune suspension n’est en cours', async () => {
    const { fixture } = monter({
      getImpayes: vi.fn().mockResolvedValue([solde({ factureId: 'f-1', abonneId: 'ab-1' })]),
      getFactures: vi.fn().mockResolvedValue([factureRef({ factureId: 'f-1', abonneId: 'ab-1' })]),
      getSuiviImpaye: vi.fn().mockResolvedValue(suivi({ etapeActuelle: 1 })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.kpi__hint--danger')).toBeNull();
  });

  it('bascule vers la vue par facture et rend le tableau avec badges d’étape, retard et paiement', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutonsVue = [...racine.querySelectorAll<HTMLButtonElement>('.imp-vue__opt')];
    boutonsVue[1].click(); // « Facture »
    fixture.detectChanges();

    expect(racine.querySelector('.imp-groupes')).toBeNull(); // vue abonné démontée
    expect(racine.querySelectorAll('tbody tr.dt__row')).toHaveLength(4);

    expect(racine.querySelector('.etape-badge--etape1')).toBeTruthy();
    expect(racine.querySelector('.etape-badge--etape2')).toBeTruthy();
    expect(racine.querySelector('.etape-badge--etape3')).toBeTruthy();
    expect(racine.querySelector('.etape-badge--suspendue')).toBeTruthy();

    // La ligne suspendue (étape 4) porte la classe de ligne dangereuse.
    expect(racine.querySelector('.dt__row--danger')).toBeTruthy();
    // Le paiement partiel (ab-2) colore la colonne « payé ».
    expect(racine.querySelector('.col-paye--green')).toBeTruthy();
    // ab-3 n'a pas de retard connu : tiret dans la colonne retard.
    const colonnesRetard = [...racine.querySelectorAll('.col-retard')].map((e) => e.textContent?.trim());
    expect(colonnesRetard.some((t) => t === '—')).toBe(true);
    expect(colonnesRetard.some((t) => t?.includes('J+15'))).toBe(true);
  });

  it('rend aussi les cartes mobiles avec le motif « acompte reçu »', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartes = [...racine.querySelectorAll('.fcard')];
    expect(cartes).toHaveLength(4);
    expect(racine.querySelector('.fcard--danger')).toBeTruthy();
    const refs = cartes.map((c) => c.querySelector('.fcard__ref')?.textContent ?? '');
    expect(refs.some((t) => t.includes('IMPAYES.ACOMPTE_RECU'))).toBe(true);
  });

  it('clique sur les actions d’une ligne du tableau : paiement et relances naviguent avec cette facture', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    const racine = fixture.nativeElement as HTMLElement;
    const boutonsVue = [...racine.querySelectorAll<HTMLButtonElement>('.imp-vue__opt')];
    boutonsVue[1].click();
    fixture.detectChanges();

    // Le tri par défaut (ancienneté) place ab-4 (le retard le plus long) en tête.
    const premiereLigne = racine.querySelector('tbody tr.dt__row') as HTMLElement;
    expect(premiereLigne.textContent).toContain('Nom ab-4');
    (premiereLigne.querySelector('.act--primary') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-4'], { queryParams: { paiement: 1 } });

    (premiereLigne.querySelector('.act:not(.act--primary)') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/impayes', 'f-4', 'relances']);
  });

  it('clique sur une carte mobile : le tap sur l’en-tête ouvre les relances, le bouton dédié le paiement', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    const racine = fixture.nativeElement as HTMLElement;
    // Même ordre que le tableau (tri par ancienneté) : ab-4 en tête.
    const premiereCarte = racine.querySelector('.fcard') as HTMLElement;
    expect(premiereCarte.textContent).toContain('Nom ab-4');
    (premiereCarte.querySelector('.fcard__top') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/impayes', 'f-4', 'relances']);

    (premiereCarte.querySelector('.fcard__pay') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-4'], { queryParams: { paiement: 1 } });
  });

  it('trie le tableau au clic sur chaque en-tête triable', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutonsVue = [...racine.querySelectorAll<HTMLButtonElement>('.imp-vue__opt')];
    boutonsVue[1].click();
    fixture.detectChanges();

    const enTetes = [...racine.querySelectorAll<HTMLButtonElement>('.dt__sort-btn')];
    // abonné, montant, payé, solde, retard, étape (actions n'est pas triable).
    expect(enTetes).toHaveLength(6);
    for (const bouton of enTetes) {
      bouton.click();
      fixture.detectChanges();
      expect(bouton.classList.contains('dt__sort-btn--active')).toBe(true);
    }

    // Vérification concrète sur une colonne : un seul tri actif à la fois — passer
    // au solde réordonne réellement les lignes affichées (asc puis desc).
    const boutonSolde = enTetes[3];
    const sansEspaces = (t: string | null | undefined) => (t ?? '').replace(/\s/g, '');

    boutonSolde.click(); // nouvelle colonne active -> asc
    fixture.detectChanges();
    let soldesAffiches = [...racine.querySelectorAll('.col-solde')].map((e) => sansEspaces(e.textContent));
    expect(soldesAffiches[0]).toBe('3000'); // ab-2, le plus petit solde, en tete en asc

    boutonSolde.click(); // desc
    fixture.detectChanges();
    soldesAffiches = [...racine.querySelectorAll('.col-solde')].map((e) => sansEspaces(e.textContent));
    expect(soldesAffiches[0]).toBe('7000'); // ab-4, le plus grand solde, en tete en desc
  });

  it('onFiltersChange traduit étape et tri reçus du panneau de filtres, y compris leur effacement', async () => {
    const { fixture, c } = creerJeuComplet();
    fixture.detectChanges();
    await flush();

    c.onFiltersChange({ etape: '2', tri: 'SOLDE' });
    expect(c.filtreEtape()).toBe(2);
    expect(c.tri()).toBe('SOLDE');
    expect(c.impayesFiltres().map((i) => i.factureId)).toEqual(['f-2']);

    c.onFiltersChange({ etape: null, tri: null });
    expect(c.filtreEtape()).toBe('TOUS');
    expect(c.tri()).toBe('ANCIENNETE');
  });

  it('badgeLabel restitue un libellé pour chaque état, y compris pause et inconnu', async () => {
    const { c } = monter();
    const base = {
      factureId: 'f-x', abonneId: null, abonneNom: '', numeroAbonne: '', numeroFacture: '',
      montantTotal: 0, montantPaye: 0, soldeRestant: 0, statut: '', etapeActuelle: null,
      dateDepassement: null, retardJours: null, enPause: false,
    };
    expect(c.badgeLabel({ ...base, enPause: true })).toBe('IMPAYES.BADGE.PAUSE');
    expect(c.badgeLabel({ ...base, etapeActuelle: 1 })).toBe('IMPAYES.BADGE.ETAPE1');
    expect(c.badgeLabel({ ...base, etapeActuelle: 2 })).toBe('IMPAYES.BADGE.ETAPE2');
    expect(c.badgeLabel({ ...base, etapeActuelle: 3 })).toBe('IMPAYES.BADGE.ETAPE3');
    expect(c.badgeLabel({ ...base, etapeActuelle: 4 })).toBe('IMPAYES.BADGE.SUSPENDUE');
    expect(c.badgeLabel({ ...base })).toBe('—'); // ni pause, ni étape connue
  });

  it('retardClass distingue muet, alerte et danger selon l’ancienneté', async () => {
    const { c } = monter();
    expect(c.retardClass(null)).toBe('retard--muted');
    expect(c.retardClass(2)).toBe('retard--muted');
    expect(c.retardClass(3)).toBe('retard--warn');
    expect(c.retardClass(9)).toBe('retard--warn');
    expect(c.retardClass(10)).toBe('retard--danger');
  });

  it('tape dans le champ de recherche du panneau de filtres : filtre réellement la liste après le délai', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champ = racine.querySelector('input[type="text"]') as HTMLInputElement;
    expect(champ).toBeTruthy();
    champ.value = 'ab-2';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 300)); // debounceMs=250 côté panneau de filtres
    fixture.detectChanges();

    expect(racine.querySelectorAll('.imp-groupe')).toHaveLength(1);
    expect(racine.querySelector('.imp-groupe__ref')?.textContent).toBe('AB-2');
  });

  it('clique sur une puce de filtre par étape dans le panneau : filtre réellement la liste', async () => {
    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const puces = [...racine.querySelectorAll<HTMLButtonElement>('.fp__chip')];
    // Sans traduction chargée en test, chaque option affiche la clé brute
    // « IMPAYES.CHIP_ETAPE » : la première puce (hors « Tous ») correspond à l'étape 1.
    const puceEtape = puces.find((b) => b.textContent?.includes('IMPAYES.CHIP_ETAPE'));
    expect(puceEtape).toBeTruthy();
    puceEtape!.click();
    fixture.detectChanges();

    expect(racine.querySelectorAll('.imp-groupe').length).toBeGreaterThan(0);
    expect(racine.querySelectorAll('.imp-groupe').length).toBeLessThan(4);
  });

  it('clique sur le bouton d’export du bandeau, et revient à la vue par abonné après être passé en facture', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();

    const { fixture } = creerJeuComplet();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.bilan-btn') as HTMLButtonElement).click();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);

    const boutonsVue = [...racine.querySelectorAll<HTMLButtonElement>('.imp-vue__opt')];
    boutonsVue[1].click(); // facture
    fixture.detectChanges();
    expect(racine.querySelector('.imp-groupes')).toBeNull();

    boutonsVue[0].click(); // retour abonné
    fixture.detectChanges();
    expect(racine.querySelectorAll('.imp-groupe')).toHaveLength(4);
  });
});
