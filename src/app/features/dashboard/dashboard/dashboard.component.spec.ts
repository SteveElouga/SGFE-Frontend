import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService, StatsMois, StatsGlobales, HistoriqueCampagne } from '../../../core/dashboard/dashboard.service';
import { DashboardComponent } from './dashboard.component';
import type { AgentAffecte } from '../../../shared/models/campagne.model';
import type { GetAllEnvoisQuery, GetAllPaiementsQuery, GetCampagnesQuery } from '../../../graphql/generated';
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

function campagne(partial: Partial<GetCampagnesQuery['campagnes'][number]> = {}): GetCampagnesQuery['campagnes'][number] {
  return {
    campagneId: 'c1',
    nom: 'Campagne',
    periodeMois: 7,
    periodeAnnee: 2026,
    statut: 'EN_COURS',
    datePlanifiee: '2026-07-01',
    dateCreation: '2026-06-25',
    dateCloture: '',
    createdBy: 'u1',
    numeroMobileMoney: '',
    genererFacturesAuto: true,
    envoyerWhatsappAuto: false,
    ...partial,
  };
}

function statsGlobales(partial: Partial<StatsGlobales> = {}): StatsGlobales {
  return {
    consommationTotaleGlobale: 0,
    montantTotalFactureGlobal: 0,
    montantTotalEncaisseGlobal: 0,
    historiqueCampagnes: [],
    ...partial,
  };
}

function historique(partial: Partial<HistoriqueCampagne>): HistoriqueCampagne {
  return {
    campagneId: 'c1',
    nomCampagne: '',
    totalAbonnes: 0,
    nbReleves: 0,
    pourcentageProgression: 0,
    consommationTotale: 0,
    ...partial,
  };
}

function agentAffecte(partial: Partial<AgentAffecte> = {}): AgentAffecte {
  return {
    agentId: 'ag-1',
    username: 'jean.dupont',
    role: 'AGENT',
    statut: 'ACTIF',
    derniereActivite: null,
    nbReleves: 0,
    zones: [],
    ...partial,
  };
}

function paiement(partial: Partial<GetAllPaiementsQuery['paiements'][number]> = {}): GetAllPaiementsQuery['paiements'][number] {
  return {
    paiementId: 'p1',
    factureId: 'f1',
    montant: 1000,
    datePaiement: '2026-07-01',
    modePaiement: 'ESPECES',
    referenceTransaction: '',
    createdAt: '2026-07-01',
    annule: false,
    annuleLe: '',
    annulePar: '',
    motifAnnulation: '',
    ...partial,
  };
}

describe('DashboardComponent', () => {
  // Pas de `localStorage` dans l'environnement Vitest : la persistance de
  // `periode` est déjà gardée par `typeof localStorage` côté composant, et
  // chaque test pose sa période explicitement via `setPeriode()`.
  function setup(
    role: Role = 'COMPTABLE',
    overrides: {
      loadAll?: ReturnType<typeof vi.fn>;
      reloadSource?: ReturnType<typeof vi.fn>;
      loadAgentsByCampagne?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const roleSig = signal<Role>(role);
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: {
            loadAll: overrides.loadAll ?? vi.fn(),
            reloadSource: overrides.reloadSource ?? vi.fn(),
            loadAgentsByCampagne: overrides.loadAgentsByCampagne ?? vi.fn(),
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

  describe('kpiPartielles et kpiAujourdhui', () => {
    it('kpiPartielles reste null tant que sa source est dégradée', () => {
      const { component } = setup();
      expect(component.kpiPartielles()).toBeNull();
    });

    it('somme le solde restant des seules factures partielles', () => {
      const { component } = setup();
      component.impayes.set([
        solde({ factureId: 'f1', soldeRestant: 2_000 }),
        solde({ factureId: 'f2', soldeRestant: 4_000 }),
        solde({ factureId: 'f3', soldeRestant: 1_000 }),
      ]);
      component.factures.set([
        facture({ factureId: 'f1', statut: 'PARTIELLE' }),
        facture({ factureId: 'f2', statut: 'PARTIELLE' }),
        facture({ factureId: 'f3', statut: 'IMPAYEE' }),
      ]);
      expect(component.kpiPartielles()).toEqual({ count: 2, total: 6_000 });
    });

    it('kpiAujourdhui ne compte que les paiements enregistrés le jour même', () => {
      const { component } = setup();
      const aujourdhui = new Date().toISOString();
      component.paiements.set([
        paiement({ paiementId: 'p1', montant: 1_000, datePaiement: aujourdhui }),
        paiement({ paiementId: 'p2', montant: 9_000, datePaiement: '2020-01-01T00:00:00.000Z' }),
      ]);
      expect(component.kpiAujourdhui()).toEqual({ count: 1, total: 1_000 });
    });
  });

  describe('topImpayesAnciens', () => {
    it('reste vide tant que soldes ou factures ne sont pas chargés', () => {
      const { component } = setup();
      component.impayes.set([solde({ factureId: 'f1' })]);
      expect(component.topImpayesAnciens()).toEqual([]);
    });

    it('exclut les créances dont l’échéance n’est pas dépassée', () => {
      // `topImpayesAnciens` calcule le retard sur l'échéance de la FACTURE
      // (`f.dateLimitePaiement`), pas sur celle du solde impayé.
      const { component } = setup();
      const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      component.impayes.set([solde({ factureId: 'f1' })]);
      component.factures.set([facture({ factureId: 'f1', dateLimitePaiement: future })]);
      expect(component.topImpayesAnciens()).toEqual([]);
    });

    it('trie du retard le plus ancien au plus récent, limité à 5 lignes', () => {
      const { component } = setup();
      const soldes = Array.from({ length: 6 }, (_, i) => solde({ factureId: `f${i}` }));
      const factures = Array.from({ length: 6 }, (_, i) =>
        facture({
          factureId: `f${i}`,
          abonneNom: `Abonné ${i}`,
          dateLimitePaiement: new Date(Date.now() - (i + 1) * 10 * 86_400_000).toISOString().slice(0, 10),
        }),
      );
      component.impayes.set(soldes);
      component.factures.set(factures);

      const top = component.topImpayesAnciens();
      expect(top).toHaveLength(5);
      expect(top[0].nom).toBe('Abonné 5'); // échéance dépassée depuis le plus longtemps
      expect(top.map((t) => t.jours)).toEqual(
        [...top.map((t) => t.jours)].sort((a, b) => b - a),
      );
    });

    it('retombe sur le numéro de facture quand ni nom ni numéro d’abonné ne sont connus', () => {
      const { component } = setup();
      component.impayes.set([solde({ factureId: 'f1' })]);
      component.factures.set([
        facture({
          factureId: 'f1',
          abonneNom: '',
          abonneNumero: '',
          numeroFacture: 'FA-0099',
          dateLimitePaiement: '2020-01-01',
        }),
      ]);
      expect(component.topImpayesAnciens()[0].nom).toBe('FA-0099');
    });
  });

  describe('campagnesCards — visibilité par rôle', () => {
    it('ne garde que les campagnes actives ou planifiées', () => {
      const { component } = setup('ADMIN');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS' }),
        campagne({ campagneId: 'c2', statut: 'PLANIFIEE' }),
        campagne({ campagneId: 'c3', statut: 'CLOTUREE' }),
      ]);
      expect(component.campagnesCards().map((c) => c.campagneId)).toEqual(['c1', 'c2']);
    });

    it('un ADMIN voit les campagnes actives de tous les créateurs', () => {
      const { component } = setup('ADMIN');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'un-autre-superviseur' }),
      ]);
      expect(component.campagnesCards()).toHaveLength(1);
    });

    it('un SUPERVISEUR ne voit que les campagnes qu’il a créées', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1' }),
        campagne({ campagneId: 'c2', statut: 'EN_COURS', createdBy: 'un-autre-superviseur' }),
      ]);
      expect(component.campagnesCards().map((c) => c.campagneId)).toEqual(['c1']);
    });

    it('reprend la progression connue de l’historique, sinon 0', () => {
      const { component } = setup('ADMIN');
      component.campagnes.set([campagne({ campagneId: 'c1', statut: 'EN_COURS' })]);
      component.stats.set(
        statsGlobales({
          historiqueCampagnes: [
            historique({ campagneId: 'c1', totalAbonnes: 40, nbReleves: 30, pourcentageProgression: 75 }),
          ],
        }),
      );
      expect(component.campagnesCards()[0]).toMatchObject({ pourcentage: 75, nbReleves: 30, totalAbonnes: 40 });
    });

    it('vaut 0 quand aucun historique ne couvre la campagne', () => {
      const { component } = setup('ADMIN');
      component.campagnes.set([campagne({ campagneId: 'c1', statut: 'EN_COURS' })]);
      expect(component.campagnesCards()[0]).toMatchObject({ pourcentage: 0, nbReleves: 0, totalAbonnes: 0 });
    });
  });

  describe('superviseurCards — agents affectés', () => {
    it('associe à chaque campagne les agents chargés pour elle, vide sinon', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1' }),
        campagne({ campagneId: 'c2', statut: 'EN_COURS', createdBy: 'u1' }),
      ]);
      component.agentsByCampagne.set(new Map([['c1', [agentAffecte({ agentId: 'a1' })]]]));

      const cards = component.superviseurCards();
      expect(cards.find((c) => c.campagneId === 'c1')!.agents).toHaveLength(1);
      expect(cards.find((c) => c.campagneId === 'c2')!.agents).toEqual([]);
    });

    it('distingue les agents actifs des inactifs (statut explicite ou silence de plus de 48h)', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1' })]);
      const silenceLong = new Date(Date.now() - 49 * 3600 * 1000).toISOString();
      component.agentsByCampagne.set(
        new Map([
          [
            'c1',
            [
              agentAffecte({ agentId: 'a1', statut: 'ACTIF', derniereActivite: null }),
              agentAffecte({ agentId: 'a2', statut: 'INACTIF' }),
              agentAffecte({ agentId: 'a3', statut: 'ACTIF', derniereActivite: silenceLong }),
            ],
          ],
        ]),
      );

      const card = component.superviseurCards()[0];
      expect(card.nbAgentsActifs).toBe(1);
      expect(card.nbAgentsInactifs).toBe(2);
    });
  });

  describe('superviseurHero', () => {
    it('est null sans campagne', () => {
      const { component } = setup('SUPERVISEUR');
      expect(component.superviseurHero()).toBeNull();
    });

    it('moyenne la progression des seules campagnes en cours (pas les planifiées)', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1' }),
        campagne({ campagneId: 'c2', statut: 'EN_COURS', createdBy: 'u1' }),
        campagne({ campagneId: 'c3', statut: 'PLANIFIEE', createdBy: 'u1' }),
      ]);
      component.stats.set(
        statsGlobales({
          historiqueCampagnes: [
            historique({ campagneId: 'c1', pourcentageProgression: 40 }),
            historique({ campagneId: 'c2', pourcentageProgression: 60 }),
          ],
        }),
      );

      const hero = component.superviseurHero()!;
      expect(hero.nbActives).toBe(2);
      expect(hero.nbTotal).toBe(3);
      expect(hero.pourcentageMoyen).toBe(50);
    });
  });

  describe('actionsSuperviseur', () => {
    it('signale les agents inactifs avec leur compte total', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
      ]);
      component.agentsByCampagne.set(
        new Map([['c1', [agentAffecte({ agentId: 'a1', statut: 'INACTIF' })]]]),
      );
      expect(component.actionsSuperviseur()).toEqual([
        expect.objectContaining({ key: 'agents-inactifs', severity: 'warning', params: { count: 1 } }),
      ]);
    });

    it('signale les campagnes prêtes à démarrer (statut PLANIFIEE)', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([campagne({ campagneId: 'c1', statut: 'PLANIFIEE', createdBy: 'u1' })]);
      const action = component.actionsSuperviseur().find((a) => a.key === 'attente-demarrage');
      expect(action).toMatchObject({ severity: 'info', params: { count: 1 } });
    });

    it('signale un retard de plus de 20 jours, uniquement pour les campagnes du superviseur courant', () => {
      const { component } = setup('SUPERVISEUR');
      const vieux = new Date(Date.now() - 25 * 86_400_000).toISOString();
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: vieux }),
        campagne({ campagneId: 'c2', statut: 'EN_COURS', createdBy: 'un-autre-superviseur', datePlanifiee: vieux }),
      ]);
      const action = component.actionsSuperviseur().find((a) => a.key === 'campagnes-retard');
      expect(action).toMatchObject({ severity: 'danger', params: { count: 1 } });
    });

    it('signale les campagnes prêtes à clôturer (100% de progression)', () => {
      const { component } = setup('SUPERVISEUR');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
      ]);
      component.stats.set(
        statsGlobales({
          historiqueCampagnes: [historique({ campagneId: 'c1', pourcentageProgression: 100 })],
        }),
      );
      expect(component.actionsSuperviseur()).toEqual([
        expect.objectContaining({ key: 'campagnes-pretes-cloture', severity: 'info', params: { count: 1 } }),
      ]);
    });

    it('trie les actions par sévérité décroissante, quel que soit l’ordre de détection', () => {
      const { component } = setup('SUPERVISEUR');
      // Ordre naturel de détection : attente-démarrage (info) avant campagnes-retard
      // (danger) et agents-inactifs (warning) — le tri doit inverser cet ordre.
      const vieux = new Date(Date.now() - 25 * 86_400_000).toISOString();
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'PLANIFIEE', createdBy: 'u1' }),
        campagne({ campagneId: 'c2', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: vieux }),
      ]);
      component.agentsByCampagne.set(
        new Map([['c2', [agentAffecte({ agentId: 'a1', statut: 'INACTIF' })]]]),
      );

      expect(component.actionsSuperviseur().map((a) => a.key)).toEqual([
        'campagnes-retard',
        'agents-inactifs',
        'attente-demarrage',
      ]);
    });
  });

  describe('showSuperviseurToutAJour', () => {
    it('est vrai pour un superviseur sans action requise et avec au moins une campagne', () => {
      const { component } = setup('SUPERVISEUR');
      // `datePlanifiee` récente : la campagne par défaut (juillet) déclenche
      // sinon elle-même l'action "campagnes-retard" (> 20 jours).
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
      ]);
      expect(component.showSuperviseurToutAJour()).toBe(true);
    });

    it('reste faux pour un ADMIN, même sans action détectée', () => {
      const { component } = setup('ADMIN');
      component.campagnes.set([
        campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
      ]);
      expect(component.showSuperviseurToutAJour()).toBe(false);
    });

    it('reste faux tant que le superviseur n’a encore aucune campagne', () => {
      const { component } = setup('SUPERVISEUR');
      expect(component.showSuperviseurToutAJour()).toBe(false);
    });
  });

  describe('états vides', () => {
    it('emptyComptable signale un tenant sans le moindre encaissement', () => {
      const { component } = setup('COMPTABLE');
      component.statsParMois.set([mois({ encaisse: 0 }), mois({ encaisse: 0 })]);
      expect(component.emptyComptable()).toBe(true);
    });

    it('emptyComptable redevient faux dès qu’un mois a encaissé quelque chose', () => {
      const { component } = setup('COMPTABLE');
      component.statsParMois.set([mois({ encaisse: 0 }), mois({ encaisse: 500 })]);
      expect(component.emptyComptable()).toBe(false);
    });

    it('emptyComptable ne s’applique jamais à un autre rôle', () => {
      const { component } = setup('ADMIN');
      component.statsParMois.set([mois({ encaisse: 0 })]);
      expect(component.emptyComptable()).toBe(false);
    });

    it('emptyGlobal signale un tenant vierge (0 facture émise, 0 FCFA facturé)', () => {
      const { component } = setup('ADMIN');
      component.stats.set(statsGlobales({ montantTotalFactureGlobal: 0 }));
      component.factures.set([]);
      expect(component.emptyGlobal()).toBe(true);
    });

    it('emptyGlobal redevient faux dès qu’une facture existe', () => {
      const { component } = setup('ADMIN');
      component.stats.set(statsGlobales({ montantTotalFactureGlobal: 0 }));
      component.factures.set([facture({ factureId: 'f1' })]);
      expect(component.emptyGlobal()).toBe(false);
    });
  });

  describe('retrySource', () => {
    it('ne recharge que la source demandée et laisse les autres inchangées', async () => {
      const reloadSource = vi.fn().mockResolvedValue({
        stats: null,
        statsParMois: null,
        campagnes: [campagne({ campagneId: 'c-neuf' })],
        impayes: null,
        paiements: null,
        factures: null,
        envois: null,
      });
      const { component } = setup('ADMIN', { reloadSource });
      component.stats.set(statsGlobales({ montantTotalFactureGlobal: 42 }));

      await component.retrySource('campagnes');

      expect(reloadSource).toHaveBeenCalledWith('campagnes');
      expect(component.campagnes()).toEqual([campagne({ campagneId: 'c-neuf' })]);
      // `stats` n'a pas été demandé : sa valeur pré-existante reste intacte,
      // malgré le `stats: null` que le mock renvoie pour les autres sources.
      expect(component.stats()).toEqual(statsGlobales({ montantTotalFactureGlobal: 42 }));
    });
  });

  describe('load — orchestration selon le rôle', () => {
    function resultat(p: { campagnes?: GetCampagnesQuery['campagnes'] } = {}) {
      return {
        stats: null,
        statsParMois: null,
        campagnes: p.campagnes ?? [],
        impayes: null,
        paiements: null,
        factures: null,
        envois: null,
      };
    }

    it('bascule loading à faux une fois toutes les sources posées', async () => {
      const loadAll = vi.fn().mockResolvedValue(resultat());
      const { component } = setup('ADMIN', { loadAll });

      await component.load();

      expect(loadAll).toHaveBeenCalledTimes(1);
      expect(component.loading()).toBe(false);
    });

    it('un ADMIN ne déclenche jamais le chargement des agents par campagne', async () => {
      const loadAll = vi.fn().mockResolvedValue(
        resultat({ campagnes: [campagne({ campagneId: 'c1', createdBy: 'u1' })] }),
      );
      const loadAgentsByCampagne = vi.fn();
      const { component } = setup('ADMIN', { loadAll, loadAgentsByCampagne });

      await component.load();

      expect(loadAgentsByCampagne).not.toHaveBeenCalled();
    });

    it('un SUPERVISEUR ne demande les agents que de ses propres campagnes', async () => {
      const loadAll = vi.fn().mockResolvedValue(
        resultat({
          campagnes: [
            campagne({ campagneId: 'c1', createdBy: 'u1' }),
            campagne({ campagneId: 'c2', createdBy: 'un-autre-superviseur' }),
          ],
        }),
      );
      const loadAgentsByCampagne = vi.fn().mockResolvedValue(new Map());
      const { component } = setup('SUPERVISEUR', { loadAll, loadAgentsByCampagne });

      await component.load();

      expect(loadAgentsByCampagne).toHaveBeenCalledWith(['c1']);
    });
  });

  describe('formatage', () => {
    it('formatDelta neutralise les variations négligeables et l’absence de valeur', () => {
      const { component } = setup();
      expect(component.formatDelta(0.2)).toBe('≈ 0%');
      expect(component.formatDelta(null)).toBe('');
    });

    it('formatDelta signe les variations significatives', () => {
      const { component } = setup();
      expect(component.formatDelta(12.4)).toBe('+12%');
      expect(component.formatDelta(-8.2)).toBe('−8%');
    });

    it('deltaClass associe la teinte au signe de la variation', () => {
      const { component } = setup();
      expect(component.deltaClass(null)).toBe('dash-delta--neutre');
      expect(component.deltaClass(0.1)).toBe('dash-delta--neutre');
      expect(component.deltaClass(5)).toBe('dash-delta--up');
      expect(component.deltaClass(-5)).toBe('dash-delta--down');
    });

    it('formatFCFA regroupe les milliers sans suffixe monétaire', () => {
      const { component } = setup();
      expect(component.formatFCFA(1_234_567)).toMatch(/^1.234.567$/);
    });

    it('formatNumber arrondit et regroupe les milliers', () => {
      const { component } = setup();
      expect(component.formatNumber(1234.6)).toMatch(/^1.235$/);
    });
  });

  describe('setPeriode', () => {
    it('change la période sélectionnée et recalcule le nombre de mois agrégés', () => {
      const { component } = setup();
      expect(component.periodeNbMois()).toBe(1);

      component.setPeriode('mois-6');

      expect(component.periode()).toBe('mois-6');
      expect(component.periodeNbMois()).toBe(6);
    });
  });
});
