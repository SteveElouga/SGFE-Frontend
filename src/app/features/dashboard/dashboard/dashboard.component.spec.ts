import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService, StatsMois } from '../../../core/dashboard/dashboard.service';
import { DashboardComponent } from './dashboard.component';
import type { GetAllEnvoisQuery } from '../../../graphql/generated';
import type { FactureLigne, SoldeImpaye } from '../../../graphql/vues';

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

// Exactement `FactureLigneFields` : ce que `GET_FACTURES` rapporte au tableau
// de bord. La fixture portait avant `prixM3`, `pdfPath`, `dateGeneration` et
// les deux index — des champs qu'aucune requête de liste ne demande.
function facture(partial: Partial<FactureLigne>): FactureLigne {
  return {
    factureId: 'f1',
    numeroFacture: 'FA-0001',
    abonneId: 'a1',
    abonneNom: 'Diallo',
    abonneNumero: 'AB-0001',
    campagneId: 'c1',
    campagneNom: 'Juillet 2026',
    campagnePeriodeMois: 7,
    campagnePeriodeAnnee: 2026,
    consommation: 10,
    montant: 5000,
    statut: 'IMPAYEE',
    dateReleve: '2026-07-01',
    dateLimitePaiement: '2026-07-31',
    ...partial,
  };
}

function envoi(partial: Partial<GetAllEnvoisQuery['envois'][number]>): GetAllEnvoisQuery['envois'][number] {
  return {
    envoiId: 'e1',
    abonneId: 'a1',
    factureId: 'f1',
    typeEnvoi: 'FACTURE',
    statut: 'ENVOYE',
    dateEnvoi: '2026-07-01',
    erreur: '',
    raisonEchec: '',
    ...partial,
  };
}

function solde(partial: Partial<SoldeImpaye>): SoldeImpaye {
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

  it('keeps the ribbon "envois" step null while its source is degraded', () => {
    const { component } = setup('ADMIN');
    expect(component.ribbonCycle().envois).toBeNull();
  });

  it('counts the ribbon "envois" step once its source is loaded', () => {
    const { component } = setup('ADMIN');
    component.envois.set([
      envoi({ envoiId: 'e1' }),
      envoi({ envoiId: 'e2' }),
      envoi({ envoiId: 'e3', statut: 'ECHEC' }),
    ]);

    expect(component.ribbonCycle().envois).toEqual({ count: 3, label: 'ENVOIS_TOTAL' });
  });
});
