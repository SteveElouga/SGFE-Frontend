import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService, StatsMois, StatsGlobales, HistoriqueCampagne } from '../../../core/dashboard/dashboard.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { DashboardComponent } from './dashboard.component';
import type { AgentAffecte } from '../../../shared/models/campagne.model';
import type { GetAllEnvoisQuery, GetAllPaiementsQuery, GetCampagnesQuery } from '../../../graphql/generated';
import type { FactureLigne, SoldeImpaye } from '../../../graphql/vues';

// `<app-page-topbar>` embarque la cloche de notifications
// (NotificationBellComponent), qui lit `notifications()`/`unreadCount()` sur
// le service — indispensable dès qu'on rend le template (`detectChanges()`),
// comme le fait déjà `envois-list.component.spec.ts` pour le même composant.
const notificationsStub = { unreadCount: signal(0), notifications: signal([]) };

/** Laisse les micro-tâches en attente s'écouler (le `load()` async de `ngOnInit`). */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

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
  // `localStorage` existe bel et bien dans cet environnement (jsdom/happy-dom)
  // et persiste entre les tests d'un même fichier — contrairement à ce qu'un
  // commentaire précédent supposait. `setPeriode()` y écrit la clé
  // `dashboard.periode` ; sans ce nettoyage, un test antérieur qui appelle
  // `setPeriode('mois-3')` fait lire 'mois-3' au constructeur du composant
  // suivant au lieu du repli par défaut `'mois-1'` — trouvé via un vrai échec
  // CI (periodeNbMois() valait 3 au lieu de 1), pas deviné.
  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('dashboard.periode');
    }
  });

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
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
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
        { provide: NotificationsService, useValue: notificationsStub },
      ],
    });
    // Pas de detectChanges par défaut → ngOnInit (chargement des données) ne
    // s'exécute pas. Les tests de rendu ci-dessous appellent eux-mêmes
    // `fixture.detectChanges()` (voir describe « rendu du template »).
    const fixture = TestBed.createComponent(DashboardComponent);
    return { component: fixture.componentInstance, role: roleSig, fixture };
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

  // ── Rendu du template selon le rôle ───────────────────────────────────────
  //
  // Tous les tests ci-dessus pilotent la logique du composant (signaux,
  // calculs) sans jamais appeler `fixture.detectChanges()` : le template n'y
  // est donc jamais rendu. Ceux qui suivent appellent bien `detectChanges()`,
  // attendent la résolution de `load()` (async, déclenché par `ngOnInit`) via
  // `flush()`, puis rappellent `detectChanges()` pour refléter les signaux mis
  // à jour — et vérifient un vrai contenu dans le DOM, pas seulement l'état du
  // composant.
  function chiffres(texte: string | null | undefined): string {
    return (texte ?? '').replace(/[^0-9-]/g, '');
  }

  describe('rendu du template — vue COMPTABLE', () => {
    function monterComptable() {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 999_999 }),
        statsParMois: [
          mois({ moisNum: 7, annee: 2026, encaisse: 150_000, facture: 200_000, consommation: 500 }),
          mois({ moisNum: 6, annee: 2026, encaisse: 100_000, facture: 180_000, consommation: 400 }),
        ],
        campagnes: [],
        impayes: [
          solde({ factureId: 'f1', soldeRestant: 5_000 }),
          solde({ factureId: 'f2', soldeRestant: 3_000 }),
        ],
        paiements: [
          paiement({ paiementId: 'p1', montant: 2_500, datePaiement: new Date().toISOString() }),
        ],
        factures: [
          facture({
            factureId: 'f1', montant: 5_000, statut: 'IMPAYEE',
            abonneNom: 'Diallo', abonneNumero: 'AB-01', dateLimitePaiement: '2020-01-01',
          }),
          facture({
            factureId: 'f2', montant: 3_000, statut: 'PARTIELLE',
            abonneNom: 'Fotso', abonneNumero: 'AB-02', dateLimitePaiement: '2020-02-01',
          }),
        ],
        envois: [],
      });
      const reloadSource = vi.fn();
      const { fixture } = setup('COMPTABLE', { loadAll, reloadSource });
      return { fixture, racine: fixture.nativeElement as HTMLElement, loadAll, reloadSource };
    }

    it('affiche le héros encaissé, les 3 KPI et le top 5 des impayés anciens', async () => {
      const { fixture, racine } = monterComptable();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      // Héros : encaissé du mois courant + delta vs mois précédent.
      const hero = racine.querySelector('.dash-hero__count');
      expect(chiffres(hero?.textContent)).toContain('150000');
      const delta = racine.querySelector('.dash-hero__delta');
      expect(delta?.textContent).toContain('+50%'); // (150000-100000)/100000

      // KPI impayés (danger) : 1 facture IMPAYEE, 5 000 FCFA.
      const kpiImpayes = racine.querySelector('.dash-kpi--danger');
      expect(kpiImpayes?.querySelector('.dash-kpi__value')?.textContent?.trim()).toBe('1');
      expect(chiffres(kpiImpayes?.querySelector('.dash-kpi__hint')?.textContent)).toContain('5000');

      // KPI partielles (warning) : 1 facture PARTIELLE, 3 000 FCFA de solde.
      const kpiPartielles = racine.querySelector('.dash-kpi--warning');
      expect(kpiPartielles?.querySelector('.dash-kpi__value')?.textContent?.trim()).toBe('1');
      expect(chiffres(kpiPartielles?.querySelector('.dash-kpi__hint')?.textContent)).toContain('3000');

      // KPI aujourd'hui (success) : 1 paiement, 2 500 FCFA.
      const kpiAujourdhui = racine.querySelector('.dash-kpi--success');
      expect(kpiAujourdhui?.querySelector('.dash-kpi__value')?.textContent?.trim()).toBe('1');
      expect(chiffres(kpiAujourdhui?.querySelector('.dash-kpi__hint')?.textContent)).toContain('2500');

      // Top 5 impayés anciens : les 2 factures (échéances dépassées) apparaissent.
      const items = racine.querySelectorAll('.dash-list__item');
      expect(items).toHaveLength(2);
      expect(racine.querySelector('.dash-list')?.textContent).toContain('Diallo');
      expect(racine.querySelector('.dash-list')?.textContent).toContain('Fotso');
    });

    it('change de période au clic sur un chip et met à jour la sélection visuelle', async () => {
      const { fixture, racine } = monterComptable();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const chips = Array.from(racine.querySelectorAll('.dash-periode__chip')) as HTMLButtonElement[];
      const chipMois1 = chips.find((c) => c.getAttribute('aria-checked') === 'true')!;
      expect(chipMois1.textContent).toBeTruthy();

      const chipMois3 = chips[1]; // ordre : mois-1, mois-3, mois-6, mois-12
      chipMois3.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.periode()).toBe('mois-3');
      expect(chipMois3.getAttribute('aria-checked')).toBe('true');
      expect(chipMois3.classList.contains('dash-periode__chip--active')).toBe(true);
      expect(chips[0].getAttribute('aria-checked')).toBe('false');
    });

    it('affiche la source dégradée et redemande la bonne source au clic sur « réessayer »', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        // `montantTotalFactureGlobal` non nul : sans quoi `emptyGlobal()` (0
        // facturé + 0 facture) prendrait le pas et masquerait toute la vue.
        stats: statsGlobales({ montantTotalFactureGlobal: 500 }),
        statsParMois: null, // source dégradée : héros indisponible
        campagnes: [],
        impayes: null, // source dégradée : KPI impayés indisponible
        paiements: [],
        factures: [],
        envois: [],
      });
      const reloadSource = vi.fn().mockResolvedValue({
        stats: null, statsParMois: null, campagnes: null, impayes: null, paiements: null, factures: null, envois: null,
      });
      const { fixture } = setup('COMPTABLE', { loadAll, reloadSource });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      // Bandeau d'erreur source à la place du héros.
      const bandeau = racine.querySelector('.dash-source-error');
      expect(bandeau).toBeTruthy();
      (bandeau!.querySelector('button') as HTMLButtonElement).click();
      expect(reloadSource).toHaveBeenCalledWith('statsParMois');

      // KPI impayés indisponible, avec son propre bouton de reprise ciblée.
      const indispo = racine.querySelector('.dash-kpi--unavailable');
      expect(indispo).toBeTruthy();
      (indispo!.querySelector('button') as HTMLButtonElement).click();
      expect(reloadSource).toHaveBeenCalledWith('impayes');
    });

    it('affiche l’état vide Comptable quand aucun mois n’a rien encaissé', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 10_000 }), // pas emptyGlobal
        statsParMois: [mois({ encaisse: 0 }), mois({ encaisse: 0 })],
        campagnes: [],
        impayes: [],
        paiements: [],
        factures: [facture({ factureId: 'f1' })], // pas emptyGlobal non plus
        envois: [],
      });
      const { fixture } = setup('COMPTABLE', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(racine.querySelector('.dash-empty--comptable')).toBeTruthy();
      expect(racine.querySelector('.dash-empty--comptable')?.textContent).toContain(
        racine.querySelector('.dash-empty--comptable')!.querySelector('.dash-empty__title')!.textContent,
      );
    });

    it('affiche l’état vide global (tenant vierge) pour un Comptable sans CTA Admin', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 0 }),
        statsParMois: [],
        campagnes: [],
        impayes: [],
        paiements: [],
        factures: [],
        envois: [],
      });
      const { fixture } = setup('COMPTABLE', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(racine.querySelector('.dash-empty')).toBeTruthy();
      // Le CTA « nouvelle campagne » n'est proposé qu'à l'ADMIN.
      expect(racine.querySelector('.dash-empty__cta')).toBeNull();
    });
  });

  describe('rendu du template — vue ADMIN', () => {
    function monterAdmin() {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({
          historiqueCampagnes: [historique({ campagneId: 'c1', totalAbonnes: 50, nbReleves: 40, pourcentageProgression: 80 })],
        }),
        statsParMois: [
          mois({ moisNum: 7, annee: 2026, encaisse: 300_000, facture: 350_000, consommation: 1_200 }),
          mois({ moisNum: 6, annee: 2026, encaisse: 250_000, facture: 300_000, consommation: 1_000 }),
        ],
        campagnes: [
          campagne({ campagneId: 'c1', statut: 'EN_COURS', periodeMois: 7, periodeAnnee: 2026, createdBy: 'un-superviseur' }),
          campagne({ campagneId: 'c2', statut: 'CLOTUREE' }), // filtrée : ni EN_COURS ni PLANIFIEE
        ],
        impayes: [solde({ factureId: 'f1', soldeRestant: 4_000 })],
        paiements: [paiement({ paiementId: 'p1', montant: 1_111, datePaiement: new Date().toISOString() })],
        factures: [facture({ factureId: 'f1', montant: 4_000, statut: 'IMPAYEE', dateLimitePaiement: '2020-01-01' })],
        envois: [envoi({ envoiId: 'e1' }), envoi({ envoiId: 'e2' })],
      });
      const { fixture } = setup('ADMIN', { loadAll });
      return { fixture, racine: fixture.nativeElement as HTMLElement, loadAll };
    }

    it('affiche l’attention (KPI), les mesures du mois (dont m³), le ribbon et les campagnes actives', async () => {
      const { fixture, racine } = monterAdmin();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      // Section « attention » : les mêmes 3 KPI que la vue Comptable.
      const kpiImpayes = racine.querySelector('.dash-attention .dash-kpi--danger');
      expect(kpiImpayes?.querySelector('.dash-kpi__value')?.textContent?.trim()).toBe('1');

      // Mesures du mois : consommation en m³ (spécificité SGFE eau).
      const mesureConso = racine.querySelector('.dash-mesure--conso .dash-mesure__valeur');
      expect(chiffres(mesureConso?.textContent)).toContain('1200');

      // Ribbon cycle : 1 campagne EN_COURS, 1 facture, 2 envois, 1 paiement.
      const steps = racine.querySelectorAll('.dash-step__value');
      const valeurs = Array.from(steps).map((s) => s.textContent?.trim());
      expect(valeurs).toEqual(['1', '1', '2', '1']);

      // Campagnes actives : seule c1 (EN_COURS) apparaît, pas c2 (CLOTUREE).
      const cards = racine.querySelectorAll('.dash-campaigns .dash-camp');
      expect(cards).toHaveLength(1);

      // Impayés les plus anciens, également visibles côté Admin.
      expect(racine.querySelectorAll('.dash-list__item')).toHaveLength(1);
    });

    it('affiche l’état vide global avec un CTA de création de campagne (réservé à l’Admin)', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 0 }),
        statsParMois: [],
        campagnes: [],
        impayes: [],
        paiements: [],
        factures: [],
        envois: [],
      });
      const { fixture } = setup('ADMIN', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const cta = racine.querySelector('.dash-empty__cta') as HTMLAnchorElement;
      expect(cta).toBeTruthy();
      expect(cta.getAttribute('href')).toContain('/campagnes/nouveau');
    });

    it('affiche l’état « aucune campagne » avec un CTA quand la liste est vide', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 10_000 }),
        statsParMois: [mois({ encaisse: 1 })],
        campagnes: [], // aucune campagne active
        impayes: [],
        paiements: [],
        factures: [facture({ factureId: 'f1' })],
        envois: [],
      });
      const { fixture } = setup('ADMIN', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(racine.querySelector('.dash-campaigns .dash-camp')).toBeNull();
      expect(racine.querySelector('.dash-vide')).toBeTruthy();
      expect(racine.querySelector('.dash-vide__cta')).toBeTruthy();
    });

    it('masque attention/mesures/ribbon/liste quand toutes leurs sources sont dégradées', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 500 }),
        statsParMois: null, // masque la section « mesures du mois »
        campagnes: [], // pas de dégradation ici (utilisé aussi pour l'empty-state campagnes)
        impayes: null, // masque le KPI impayés
        paiements: null, // masque le KPI aujourd'hui et le pas « paiements » du ribbon
        factures: null, // masque le KPI partielles, le pas « factures » et la liste impayés
        envois: null, // masque le pas « envois » du ribbon
      });
      const { fixture } = setup('ADMIN', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      // Aucun des 3 KPI n'est disponible : la section « attention » disparaît.
      expect(racine.querySelector('.dash-attention')).toBeNull();
      // `statsParMois` dégradé : la section « mesures du mois » disparaît.
      expect(racine.querySelector('.dash-mesures')).toBeNull();
      // Seul le pas « relevés » reste (source `campagnes` non dégradée, juste
      // vide) ; factures/envois/paiements disparaissent (sources `null`).
      expect(racine.querySelectorAll('.dash-step')).toHaveLength(1);
      expect(racine.querySelector('.dash-step')?.className).toContain('dash-step--releves');
      // Pas de facture ⇒ pas de top 5 impayés anciens.
      expect(racine.querySelector('.dash-list')).toBeNull();
      // Le ribbon lui-même reste affiché (section toujours rendue).
      expect(racine.querySelector('.dash-ribbon')).toBeTruthy();
    });
  });

  describe('rendu du template — vue SUPERVISEUR', () => {
    function monterSuperviseur(overrides: { agentsByCampagne?: ReturnType<typeof vi.fn> } = {}) {
      const loadAll = vi.fn().mockResolvedValue({
        // `montantTotalFactureGlobal` non nul : sans quoi `emptyGlobal()`
        // masquerait toute la vue Superviseur derrière l'état « tenant vierge ».
        stats: statsGlobales({
          montantTotalFactureGlobal: 500,
          historiqueCampagnes: [historique({ campagneId: 'c1', totalAbonnes: 40, nbReleves: 30, pourcentageProgression: 75 })],
        }),
        statsParMois: [mois({ encaisse: 50_000 })],
        campagnes: [
          campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
          campagne({ campagneId: 'c2', statut: 'PLANIFIEE', createdBy: 'u1' }),
        ],
        impayes: [],
        paiements: [],
        factures: [],
        envois: [],
      });
      const loadAgentsByCampagne = overrides.agentsByCampagne ?? vi.fn().mockResolvedValue(
        new Map([
          ['c1', [
            agentAffecte({ agentId: 'a1', username: 'jean.dupont', statut: 'ACTIF' }),
            agentAffecte({ agentId: 'a2', username: 'awa.sy', statut: 'INACTIF' }),
          ]],
          ['c2', []],
        ]),
      );
      const { fixture } = setup('SUPERVISEUR', { loadAll, loadAgentsByCampagne });
      return { fixture, racine: fixture.nativeElement as HTMLElement, loadAll, loadAgentsByCampagne };
    }

    it('affiche le héros de tournée, les campagnes avec leurs agents et les actions requises triées', async () => {
      const { fixture, racine } = monterSuperviseur();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      // Héros : 1 campagne active sur 2 au total.
      const hero = racine.querySelector('.dash-hero--sup .dash-hero__count');
      expect(chiffres(hero?.textContent)).toContain('1');
      expect(racine.querySelector('.dash-hero--sup .dash-hero__delta-hint')).toBeTruthy(); // nbTotal > nbActives

      // 2 cards campagnes (c1 EN_COURS + c2 PLANIFIEE), chacune du superviseur.
      const cards = racine.querySelectorAll('.dash-campaigns .dash-camp--sup');
      expect(cards).toHaveLength(2);

      // c1 affiche ses 2 agents (dont 1 inactif visuellement distingué).
      const agents = racine.querySelectorAll('.dash-agent');
      expect(agents).toHaveLength(2);
      const noms = Array.from(agents).map((a) => a.textContent?.trim());
      expect(noms.some((n) => n?.includes('jean.dupont'))).toBe(true);
      expect(noms.some((n) => n?.includes('awa.sy'))).toBe(true);
      const inactif = Array.from(agents).find((a) => a.textContent?.includes('awa.sy'));
      expect(inactif?.classList.contains('dash-agent--inactif')).toBe(true);

      // c2 n'a aucun agent affecté : message dédié.
      expect(racine.querySelector('.dash-camp__agents--empty')).toBeTruthy();

      // Actions requises : agents-inactifs (warning) avant attente-démarrage
      // (info) — triées par sévérité décroissante malgré l'ordre de détection.
      const actions = racine.querySelectorAll('.dash-actions__item');
      expect(actions).toHaveLength(2);
      expect(actions[0].className).toContain('dash-actions__item--warning');
      expect(actions[1].className).toContain('dash-actions__item--info');

      // Pas de bandeau « tout à jour » puisque des actions restent ouvertes.
      expect(racine.querySelector('.dash-tout-a-jour')).toBeNull();
    });

    it('affiche « tout est à jour » quand aucune action n’est requise', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({
          montantTotalFactureGlobal: 500,
          historiqueCampagnes: [historique({ campagneId: 'c1', pourcentageProgression: 50 })],
        }),
        statsParMois: [],
        campagnes: [
          campagne({ campagneId: 'c1', statut: 'EN_COURS', createdBy: 'u1', datePlanifiee: new Date().toISOString() }),
        ],
        impayes: [],
        paiements: [],
        factures: [],
        envois: [],
      });
      const loadAgentsByCampagne = vi.fn().mockResolvedValue(new Map());
      const { fixture } = setup('SUPERVISEUR', { loadAll, loadAgentsByCampagne });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(racine.querySelector('.dash-actions')).toBeNull();
      expect(racine.querySelector('.dash-tout-a-jour')).toBeTruthy();
    });

    it('affiche l’état vide superviseur (aucune campagne) avec son CTA', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        // Le tenant a bien de l'activité (factures existantes) : ce n'est pas
        // `emptyGlobal`, seulement CE superviseur qui n'a encore aucune campagne.
        stats: statsGlobales({ montantTotalFactureGlobal: 500 }),
        statsParMois: [],
        campagnes: [],
        impayes: [],
        paiements: [],
        factures: [facture({ factureId: 'f-autre' })],
        envois: [],
      });
      const loadAgentsByCampagne = vi.fn().mockResolvedValue(new Map());
      const { fixture } = setup('SUPERVISEUR', { loadAll, loadAgentsByCampagne });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(racine.querySelector('.dash-hero--sup')).toBeNull(); // superviseurHero() est null
      expect(racine.querySelector('.dash-campaigns .dash-empty')).toBeTruthy();
      expect(racine.querySelector('.dash-empty__cta')).toBeTruthy();
    });

    it('ne charge les agents que pour les campagnes du superviseur courant (bout en bout, via le rendu)', async () => {
      const loadAgentsByCampagne = vi.fn().mockResolvedValue(new Map());
      const { fixture, loadAll } = monterSuperviseur({ agentsByCampagne: loadAgentsByCampagne });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(loadAll).toHaveBeenCalledTimes(1);
      expect(loadAgentsByCampagne).toHaveBeenCalledWith(['c1', 'c2']);
    });
  });

  describe('rendu — navigation vers une campagne (routerLink réel)', () => {
    it('la card d’une campagne Admin pointe vers sa fiche', async () => {
      const loadAll = vi.fn().mockResolvedValue({
        stats: statsGlobales({ montantTotalFactureGlobal: 500 }),
        statsParMois: [mois({ encaisse: 1 })],
        campagnes: [campagne({ campagneId: 'c-42', statut: 'EN_COURS' })],
        impayes: [],
        paiements: [],
        factures: [facture({ factureId: 'f-1' })],
        envois: [],
      });
      const { fixture } = setup('ADMIN', { loadAll });
      const racine = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const lien = racine.querySelector('.dash-camp') as HTMLAnchorElement;
      expect(lien).toBeTruthy();
      expect(lien.getAttribute('href')).toBe('/campagnes/c-42');
    });
  });
});
