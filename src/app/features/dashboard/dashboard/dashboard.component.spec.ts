import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService, StatsMois } from '../../../core/dashboard/dashboard.service';
import { Facture, SoldeFacture } from '../../../shared/models/facture.model';
import { DashboardComponent } from './dashboard.component';

type Role = 'ADMIN' | 'COMPTABLE' | 'SUPERVISEUR';

/** Ligne d'agrégat mensuel backend (`statsParMois`) avec valeurs par défaut. */
function mois(partial: Partial<StatsMois>): StatsMois {
  return {
    mois: '2026-07',
    annee: 2026,
    moisNum: 7,
    encaisse: 0,
    facture: 0,
    consommation: 0,
    nbPaiements: 0,
    nbFactures: 0,
    ...partial,
  };
}

function facture(partial: Partial<Facture>): Facture {
  return {
    factureId: 'f1',
    numeroFacture: 'FA-0001',
    abonneId: 'a1',
    campagneId: 'c1',
    ancienIndex: 0,
    nouveauIndex: 10,
    consommation: 10,
    prixM3: 500,
    montant: 5000,
    statut: 'IMPAYEE',
    dateReleve: '2026-07-01',
    dateLimitePaiement: '2026-07-31',
    dateGeneration: '2026-07-02',
    pdfPath: '',
    numeroMobileMoney: '',
    ...partial,
  };
}

function solde(partial: Partial<SoldeFacture>): SoldeFacture {
  return {
    factureId: 'f1',
    montantTotal: 5000,
    montantPaye: 0,
    soldeRestant: 5000,
    statut: 'IMPAYEE',
    abonneId: 'a1',
    dateLimitePaiement: '2026-07-27',
    ...partial,
  };
}

describe('DashboardComponent', () => {
  // Pas de `localStorage` dans l'environnement Vitest : la persistance de
  // `periode` est déjà gardée par `typeof localStorage` côté composant, et
  // chaque test pose sa période explicitement via `setPeriode()`.
  function setup(role: Role = 'COMPTABLE') {
    const roleSig = signal<Role>(role);
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: {
            loadAll: vi.fn(),
            reloadSource: vi.fn(),
            loadAgentsByCampagne: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'u1' }),
            role: roleSig,
            isAdmin: computed(() => roleSig() === 'ADMIN'),
            isComptable: computed(() => roleSig() === 'COMPTABLE'),
            isSuperviseur: computed(() => roleSig() === 'SUPERVISEUR'),
          },
        },
        {
          provide: TranslateService,
          useValue: { instant: (k: string) => k, currentLang: () => 'fr' },
        },
      ],
    });
    // Pas de detectChanges → ngOnInit (chargement des données) ne s'exécute pas.
    const fixture = TestBed.createComponent(DashboardComponent);
    return { component: fixture.componentInstance, role: roleSig };
  }

  it('should create', () => {
    expect(setup().component).toBeTruthy();
  });

  it('maps each role to its own composition (admin = fallback)', () => {
    const { component, role } = setup('COMPTABLE');
    expect(component.viewMode()).toBe('comptable');

    role.set('SUPERVISEUR');
    expect(component.viewMode()).toBe('superviseur');

    // Tout rôle non mappé retombe sur la composition Admin (filet de sécurité).
    role.set('ADMIN');
    expect(component.viewMode()).toBe('admin');
  });

  it('computes the monthly delta from statsParMois (mois-1)', () => {
    const { component } = setup();
    component.setPeriode('mois-1');
    component.statsParMois.set([
      mois({ moisNum: 7, encaisse: 150_000 }),
      mois({ moisNum: 6, encaisse: 100_000 }),
    ]);

    const delta = component.deltaEncaisse();
    expect(delta.value).toBe(150_000);
    expect(delta.previous).toBe(100_000);
    expect(delta.deltaPct).toBe(50);
  });

  it('returns a null delta on the first month (rien à comparer)', () => {
    const { component } = setup();
    component.setPeriode('mois-1');
    component.statsParMois.set([mois({ encaisse: 150_000 })]);

    const delta = component.deltaEncaisse();
    expect(delta.value).toBe(150_000);
    expect(delta.previous).toBeNull();
    expect(delta.deltaPct).toBeNull(); // évite la division par zéro
  });

  it('aggregates the current window vs the previous one (mois-3)', () => {
    const { component } = setup();
    component.setPeriode('mois-3');
    component.statsParMois.set([
      mois({ consommation: 10 }),
      mois({ consommation: 20 }),
      mois({ consommation: 30 }), // courante = 60
      mois({ consommation: 5 }),
      mois({ consommation: 10 }),
      mois({ consommation: 15 }), // précédente = 30
    ]);

    const delta = component.deltaConso();
    expect(delta.value).toBe(60);
    expect(delta.previous).toBe(30);
    expect(delta.deltaPct).toBe(100);
  });

  it('keeps the impayés KPI null while its source is degraded', () => {
    const { component } = setup();
    expect(component.kpiImpayes()).toBeNull(); // pattern null-first : pas de "0" qui ment
  });

  it('sums the unpaid invoices once the sources are loaded', () => {
    const { component } = setup();
    component.impayes.set([solde({ factureId: 'f1' }), solde({ factureId: 'f2' })]);
    component.factures.set([
      facture({ factureId: 'f1', montant: 5_000, statut: 'IMPAYEE' }),
      facture({ factureId: 'f2', montant: 3_000, statut: 'IMPAYEE' }),
      facture({ factureId: 'f3', montant: 9_000, statut: 'PAYEE' }),
    ]);

    expect(component.kpiImpayes()).toEqual({ count: 2, total: 8_000 });
  });
});
