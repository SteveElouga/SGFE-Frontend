import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { CampagneDetailComponent } from './campagne-detail.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PROGRESSION_UPDATED_SUB } from '../../../graphql/queries/campagnes.queries';
import type { CampagneDetail, ReleveLigne } from '../../../graphql/vues';
import type { AgentAffecte, Progression, ResumeCloture, ZoneRepartition } from '../../../shared/models/campagne.model';
import type { Tarif } from '../../../shared/models/facture.model';
import type { CorrigerReleveMutation } from '../../../graphql/generated';

/**
 * Composant parent de la fiche campagne : orchestration du chargement
 * (campagne + progression + relevés + agents + répartition), abonnement
 * temps réel à la progression, et pilotage des sous-panneaux et de la modale
 * de clôture. Ces tests portent sur cette orchestration et sur les
 * `computed()` dérivés, avec plusieurs jeux de données distincts pour
 * prouver que chaque calcul change réellement selon ce qu'on lui donne.
 */
function campagne(p: Partial<CampagneDetail> = {}): CampagneDetail {
  return {
    campagneId: 'camp-1',
    nom: 'Campagne Août 2026',
    periodeMois: 8,
    periodeAnnee: 2026,
    statut: 'EN_COURS',
    datePlanifiee: '2026-08-01',
    dateCreation: '2026-07-25',
    dateCloture: '',
    createdBy: 'u-1',
    numeroMobileMoney: '',
    genererFacturesAuto: true,
    envoyerWhatsappAuto: false,
    ...p,
  } as CampagneDetail;
}

function progression(p: Partial<Progression> = {}): Progression {
  return {
    campagneId: 'camp-1',
    totalAbonnes: 100,
    nbReleves: 50,
    nbEnAttente: 50,
    pourcentage: 50,
    ...p,
  };
}

function releve(p: Partial<ReleveLigne> = {}): ReleveLigne {
  return {
    releveId: 'r-1',
    abonneId: 'a-1',
    ancienIndex: 100,
    nouveauIndex: 120,
    consommation: 20,
    statut: 'RELEVE',
    observation: '',
    dateReleve: '2026-08-01',
    abonneNom: 'DUPONT',
    abonnePrenom: 'Jean',
    numeroAbonne: 'AB-0001',
    numeroCompteur: 42,
    quartier: 'Bastos',
    camp: 1,
    ...p,
  } as ReleveLigne;
}

function agentAffecte(p: Partial<AgentAffecte> = {}): AgentAffecte {
  return {
    agentId: 'ag-1',
    username: 'jean.dupont',
    role: 'AGENT',
    statut: 'ACTIF',
    derniereActivite: null,
    nbReleves: 0,
    zones: [],
    ...p,
  };
}

function zoneRepartition(p: Partial<ZoneRepartition> = {}): ZoneRepartition {
  return {
    quartier: 'Bastos',
    camp: 1,
    agentId: 'ag-1',
    agentUsername: 'jean.dupont',
    nbAbonnes: 10,
    nbReleves: 5,
    pct: 50,
    ...p,
  };
}

function resumeCloture(p: Partial<ResumeCloture> = {}): ResumeCloture {
  return {
    campagneId: 'camp-1',
    totalAbonnes: 100,
    nbReleves: 60,
    nbEstimes: 10,
    nbNonReleves: 5,
    nbRestants: 25,
    nbFacturesAGenerer: 70,
    ...p,
  };
}

function tarif(p: Partial<Tarif> = {}): Tarif {
  return { tarifId: 't-1', prixM3: 500, dateEffet: '2026-01-01', isActive: true, ...p };
}

describe('CampagneDetailComponent', () => {
  function setup(
    opts: {
      role?: 'ADMIN' | 'SUPERVISEUR' | 'AGENT';
      campagne?: CampagneDetail | null;
      campagneValueChanges?:
        | Observable<{ data: { campagne: CampagneDetail | null } }>
        | Subject<{ data: { campagne: CampagneDetail | null } }>;
      progression?: Progression;
      progressionImpl?: () => Promise<Progression>;
      releves?: ReleveLigne[];
      relevesImpl?: () => Promise<ReleveLigne[]>;
      agents?: AgentAffecte[];
      repart?: ZoneRepartition[];
      abonnesActifs?: Array<{ id: string; quartier: string | null; camp: number | null }>;
      tarifActuel?: Tarif | null;
      resumeClotureResult?: ResumeCloture;
      resumeClotureImpl?: () => Promise<ResumeCloture>;
      progressionSub?:
        | Observable<{ data: { progressionUpdated: Progression | null } }>
        | Subject<{ data: { progressionUpdated: Progression | null } }>;
      refetchImpl?: () => Promise<{ data: { campagne: CampagneDetail } }>;
      demarrerImpl?: () => Promise<{ campagneId: string; statut: string }>;
      cloturerImpl?: () => Promise<void>;
    } = {},
  ) {
    const camp = opts.campagne === undefined ? campagne() : opts.campagne;
    const refetch = opts.refetchImpl
      ? vi.fn(opts.refetchImpl)
      : vi.fn().mockResolvedValue({ data: { campagne: camp } });
    const queryRef = {
      valueChanges: opts.campagneValueChanges ?? of({ data: { campagne: camp }, loading: false }),
      refetch,
    };

    const watchCampagne = vi.fn().mockReturnValue(queryRef);
    const getProgression = opts.progressionImpl
      ? vi.fn(opts.progressionImpl)
      : vi.fn().mockResolvedValue(opts.progression ?? progression());
    const getReleves = opts.relevesImpl
      ? vi.fn(opts.relevesImpl)
      : vi.fn().mockResolvedValue(opts.releves ?? []);
    const getAgentsCampagne = vi.fn().mockResolvedValue(opts.agents ?? []);
    const getRepartitionZone = vi.fn().mockResolvedValue(opts.repart ?? []);
    const getResumeCloture = opts.resumeClotureImpl
      ? vi.fn(opts.resumeClotureImpl)
      : vi.fn().mockResolvedValue(opts.resumeClotureResult ?? resumeCloture());
    const cloturerCampagne = opts.cloturerImpl ? vi.fn(opts.cloturerImpl) : vi.fn().mockResolvedValue(undefined);
    const demarrerCampagne = opts.demarrerImpl
      ? vi.fn(opts.demarrerImpl)
      : vi.fn().mockResolvedValue({ campagneId: 'camp-1', statut: 'EN_COURS' });

    const getAbonnesActifs = vi.fn().mockResolvedValue(opts.abonnesActifs ?? []);
    const getTarifActuel = vi.fn().mockResolvedValue(opts.tarifActuel === undefined ? tarif() : opts.tarifActuel);

    const success = vi.fn();
    const error = vi.fn();

    const apolloSubscribe = vi.fn().mockReturnValue(opts.progressionSub ?? of({ data: { progressionUpdated: null } }));

    const role = opts.role ?? 'ADMIN';

    TestBed.configureTestingModule({
      imports: [CampagneDetailComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'camp-1' }) } } },
        { provide: Apollo, useValue: { subscribe: apolloSubscribe } },
        {
          provide: CampagnesService,
          useValue: {
            watchCampagne,
            getProgression,
            getReleves,
            getAgentsCampagne,
            getRepartitionZone,
            getResumeCloture,
            cloturerCampagne,
            demarrerCampagne,
          },
        },
        { provide: AbonnesService, useValue: { getAbonnesActifs } },
        { provide: FacturesService, useValue: { getTarifActuel } },
        {
          provide: AuthService,
          useValue: { isAdmin: () => role === 'ADMIN', isSuperviseur: () => role === 'SUPERVISEUR' },
        },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const fixture = TestBed.createComponent(CampagneDetailComponent);
    fixture.detectChanges(); // ngOnInit

    return {
      fixture,
      c: fixture.componentInstance,
      camp,
      watchCampagne,
      refetch,
      getProgression,
      getReleves,
      getAgentsCampagne,
      getRepartitionZone,
      getResumeCloture,
      cloturerCampagne,
      demarrerCampagne,
      getAbonnesActifs,
      getTarifActuel,
      success,
      error,
      apolloSubscribe,
    };
  }

  /** Laisse les micro-tâches de `load()` (Promise.all + loadAgents + tarif) se résoudre. */
  async function flush(n = 6) {
    for (let i = 0; i < n; i++) await Promise.resolve();
  }

  // ── Chargement initial ─────────────────────────────────────────────────────

  describe('chargement initial', () => {
    it('charge la campagne, la progression et les relevés, puis lève loading', async () => {
      const releves = [releve({ releveId: 'r1' }), releve({ releveId: 'r2', abonneId: 'a-2' })];
      const { c, watchCampagne, refetch, getProgression, getReleves } = setup({
        progression: progression({ pourcentage: 42 }),
        releves,
      });
      await flush();

      expect(watchCampagne).toHaveBeenCalledWith('camp-1');
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(getProgression).toHaveBeenCalledWith('camp-1');
      expect(getReleves).toHaveBeenCalledWith('camp-1');

      expect(c.loading()).toBe(false);
      expect(c.error()).toBeNull();
      expect(c.campagne()?.nom).toBe('Campagne Août 2026');
      expect(c.progression()?.pourcentage).toBe(42);
      expect(c.releves()).toHaveLength(2);
    });

    it("s'abonne à la progression en direct pour CETTE campagne précisément", async () => {
      const { apolloSubscribe } = setup();
      await flush();
      expect(apolloSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          query: PROGRESSION_UPDATED_SUB,
          variables: { campagneId: 'camp-1' },
        }),
      );
    });

    it('une progression poussée par la souscription remplace celle du chargement initial', async () => {
      const sub = new Subject<{ data: { progressionUpdated: Progression | null } }>();
      const { c } = setup({ progression: progression({ pourcentage: 20 }), progressionSub: sub });
      await flush();
      expect(c.pourcentageAffiche()).toBe(20);

      sub.next({ data: { progressionUpdated: progression({ pourcentage: 77 }) } });
      expect(c.pourcentageAffiche()).toBe(77);
    });

    it('un échec de la souscription temps réel est silencieux : la valeur chargée reste affichée', async () => {
      const sub = new Subject<{ data: { progressionUpdated: Progression | null } }>();
      const { c } = setup({ progression: progression({ pourcentage: 65 }), progressionSub: sub });
      await flush();

      sub.error(new Error('flux indisponible'));

      expect(c.pourcentageAffiche()).toBe(65);
      expect(c.error()).toBeNull();
    });

    it("charge la carte des abonnés et le tarif courant pour un rôle habilité (ADMIN/SUPERVISEUR)", async () => {
      const { getAbonnesActifs, getTarifActuel } = setup({ role: 'ADMIN' });
      await flush();
      expect(getAbonnesActifs).toHaveBeenCalledTimes(1);
      expect(getTarifActuel).toHaveBeenCalledTimes(1);
    });

    it("ne les charge pas pour l'AGENT (queries refusées côté gateway)", async () => {
      const { getAbonnesActifs, getTarifActuel } = setup({ role: 'AGENT' });
      await flush();
      expect(getAbonnesActifs).not.toHaveBeenCalled();
      expect(getTarifActuel).not.toHaveBeenCalled();
    });

    it('charge toujours les agents affectés et la répartition par zone, quel que soit le rôle', async () => {
      const { getAgentsCampagne, getRepartitionZone } = setup({ role: 'AGENT' });
      await flush();
      expect(getAgentsCampagne).toHaveBeenCalledWith('camp-1');
      expect(getRepartitionZone).toHaveBeenCalledWith('camp-1');
    });

    it('peuple abonnesMap et abonneZones à partir des abonnés actifs qui ont un quartier connu', async () => {
      const { c } = setup({
        abonnesActifs: [
          { id: 'a-1', quartier: 'Bastos', camp: 1 },
          { id: 'a-2', quartier: null, camp: null }, // sans quartier → ignoré
        ],
      });
      await flush();
      expect(c.abonnesMap().get('a-1')).toBe('Bastos');
      expect(c.abonnesMap().has('a-2')).toBe(false);
      expect(c.abonneZones().get('a-1')).toEqual({ quartier: 'Bastos', camp: 1 });
    });
  });

  // ── Gestion des erreurs ─────────────────────────────────────────────────────

  describe('erreurs de chargement', () => {
    it('un échec de getProgression est signalé, et la progression ne se met pas à jour', async () => {
      const { c, getReleves } = setup({
        progressionImpl: () => Promise.reject(new Error('La campagne est introuvable.')),
      });
      await flush();

      expect(c.error()).toBe('La campagne est introuvable.');
      expect(c.loading()).toBe(false);
      // Promise.all rejette globalement : releves() reste vide, même si
      // getReleves() aurait pu réussir seul.
      expect(c.releves()).toHaveLength(0);
      expect(getReleves).toHaveBeenCalled();
    });

    it('la campagne reste affichée après un échec de load(), car le flux `watchCampagne` l’a déjà posée', async () => {
      const { c } = setup({
        progressionImpl: () => Promise.reject(new Error('Erreur serveur')),
      });
      await flush();
      // campagne() vient de `valueChanges.next(...)`, indépendant du Promise.all
      // qui a échoué dans load() — elle ne doit pas disparaître avec l'erreur.
      expect(c.campagne()?.nom).toBe('Campagne Août 2026');
      expect(c.error()).not.toBeNull();
    });

    it('un message technique (réseau) est remplacé par le message générique de l’écran', async () => {
      const { c } = setup({
        progressionImpl: () => Promise.reject(new Error('Failed to fetch')),
      });
      await flush();
      // sanitizeGqlMessage filtre les messages techniques → repli sur la clé i18n.
      expect(c.error()).toBe('CAMPAGNES.ERROR_LOAD');
    });

    it('le bouton "Réessayer" du bandeau relance le chargement', async () => {
      let premierAppel = true;
      const { fixture, c, getProgression } = setup({
        progressionImpl: () => {
          if (premierAppel) {
            premierAppel = false;
            return Promise.reject(new Error('Indisponible'));
          }
          return Promise.resolve(progression());
        },
      });
      await flush();
      fixture.detectChanges();
      expect(getProgression).toHaveBeenCalledTimes(1);
      expect(c.error()).toBe('Indisponible');

      const bouton = (fixture.nativeElement as HTMLElement).querySelector(
        '.error-banner__retry',
      ) as HTMLButtonElement;
      expect(bouton).toBeTruthy();
      bouton.click();
      await flush();

      expect(getProgression).toHaveBeenCalledTimes(2);
      expect(c.error()).toBeNull();
    });

    it('une erreur survenant plus tard sur le flux `watchCampagne` (après un chargement initial réussi) s’affiche', async () => {
      const sub = new Subject<{ data: { campagne: CampagneDetail } }>();
      const { c } = setup({ campagneValueChanges: sub });
      await flush();
      expect(c.error()).toBeNull();

      sub.error(new Error('Le service campagnes est indisponible'));

      expect(c.error()).toBe('Le service campagnes est indisponible');
      expect(c.loading()).toBe(false);
    });
  });

  // ── computed() : pourcentage affiché ────────────────────────────────────────

  describe('pourcentageAffiche', () => {
    it.each([
      [0, 0],
      [33.4, 33],
      [33.5, 34], // arrondi au-dessus
      [50, 50],
      [100, 100],
    ])('arrondit %s%% en %s', async (brut, attendu) => {
      const { c } = setup();
      await flush();
      c.progression.set(progression({ pourcentage: brut }));
      expect(c.pourcentageAffiche()).toBe(attendu);
    });

    it('vaut 0 quand aucune progression n’est encore connue', async () => {
      const { c } = setup();
      await flush();
      c.progression.set(null);
      expect(c.pourcentageAffiche()).toBe(0);
    });
  });

  // ── computed() : relevesByStatut sur plusieurs jeux de données ─────────────

  describe('relevesByStatut', () => {
    it('campagne tout juste créée (aucun relevé) : tout à zéro', async () => {
      const { c } = setup();
      await flush();
      c.releves.set([]);
      expect(c.relevesByStatut()).toEqual({ aRelever: 0, releve: 0, nonReleve: 0, estime: 0 });
    });

    it('campagne à 0% : tout est encore à relever', async () => {
      const { c } = setup();
      await flush();
      c.releves.set([releve({ statut: 'A_RELEVER' }), releve({ statut: 'A_RELEVER', abonneId: 'a-2' })]);
      expect(c.relevesByStatut()).toEqual({ aRelever: 2, releve: 0, nonReleve: 0, estime: 0 });
    });

    it('campagne à mi-parcours : les quatre statuts coexistent', async () => {
      const { c } = setup();
      await flush();
      c.releves.set([
        releve({ releveId: 'r1', statut: 'RELEVE' }),
        releve({ releveId: 'r2', abonneId: 'a-2', statut: 'ESTIME' }),
        releve({ releveId: 'r3', abonneId: 'a-3', statut: 'NON_RELEVE' }),
        releve({ releveId: 'r4', abonneId: 'a-4', statut: 'A_RELEVER' }),
        releve({ releveId: 'r5', abonneId: 'a-5', statut: 'RELEVE' }),
      ]);
      expect(c.relevesByStatut()).toEqual({ aRelever: 1, releve: 2, nonReleve: 1, estime: 1 });
    });

    it('campagne à 100% : plus aucun A_RELEVER', async () => {
      const { c } = setup();
      await flush();
      c.releves.set([
        releve({ releveId: 'r1', statut: 'RELEVE' }),
        releve({ releveId: 'r2', abonneId: 'a-2', statut: 'ESTIME' }),
      ]);
      expect(c.relevesByStatut().aRelever).toBe(0);
    });
  });

  // ── computed() : agentsLabel / assignedUsernames ────────────────────────────

  describe('agentsLabel et assignedUsernames', () => {
    it('campagne sans agent assigné : pas de libellé', async () => {
      const { c } = setup();
      await flush();
      c.agentsData.set([]);
      expect(c.agentsLabel()).toBeNull();
      expect(c.assignedUsernames()).toEqual([]);
    });

    it('un seul agent assigné : son nom seul', async () => {
      const { c } = setup();
      await flush();
      c.agentsData.set([agentAffecte({ username: 'awa.ba' })]);
      expect(c.agentsLabel()).toBe('awa.ba');
      expect(c.assignedUsernames()).toEqual(['awa.ba']);
    });

    it('plusieurs agents : noms joints par « · »', async () => {
      const { c } = setup();
      await flush();
      c.agentsData.set([
        agentAffecte({ agentId: 'ag-1', username: 'awa.ba' }),
        agentAffecte({ agentId: 'ag-2', username: 'koffi' }),
      ]);
      expect(c.agentsLabel()).toBe('awa.ba · koffi');
      expect(c.assignedUsernames()).toEqual(['awa.ba', 'koffi']);
    });
  });

  // ── computed() : permissions ────────────────────────────────────────────────

  describe('canActOnCampagne', () => {
    it('ADMIN peut agir', async () => {
      const { c } = setup({ role: 'ADMIN' });
      await flush();
      expect(c.canActOnCampagne()).toBe(true);
    });

    it('SUPERVISEUR peut agir', async () => {
      const { c } = setup({ role: 'SUPERVISEUR' });
      await flush();
      expect(c.canActOnCampagne()).toBe(true);
    });

    it('AGENT ne peut pas agir', async () => {
      const { c } = setup({ role: 'AGENT' });
      await flush();
      expect(c.canActOnCampagne()).toBe(false);
    });
  });

  // ── computed() : période et sous-titre selon le statut de la campagne ──────

  describe('periode', () => {
    it.each([
      [8, 2026, 'Août 2026'],
      [1, 2027, 'Janvier 2027'],
      [12, 2025, 'Décembre 2025'],
    ])('formate le mois %s / %s en "%s"', async (mois, annee, attendu) => {
      const { c } = setup({ campagne: campagne({ periodeMois: mois, periodeAnnee: annee }) });
      await flush();
      expect(c.periode()).toBe(attendu);
    });
  });

  describe('topbarTitle / topbarSubtitle selon le statut', () => {
    it('affiche un titre de repli tant que la campagne n’a pas chargé', () => {
      const { c } = setup({ campagne: null, campagneValueChanges: of({ data: { campagne: null }, loading: false }) });
      expect(c.topbarTitle()).toBe('COMMON.LOADING');
    });

    it('campagne PLANIFIEE : statut puis date de création', async () => {
      const { c } = setup({
        campagne: campagne({ statut: 'PLANIFIEE', dateCreation: '2026-07-25' }),
      });
      await flush();
      expect(c.topbarSubtitle()).toBe('CAMPAGNES.STATUT.PLANIFIEE · CAMPAGNES.CREE_LE 25/07');
    });

    it('campagne EN_COURS : même schéma que PLANIFIEE', async () => {
      const { c } = setup({
        campagne: campagne({ statut: 'EN_COURS', dateCreation: '2026-08-01' }),
      });
      await flush();
      expect(c.topbarSubtitle()).toBe('CAMPAGNES.STATUT.EN_COURS · CAMPAGNES.CREE_LE 01/08');
    });

    it('campagne CLOTUREE avec une date de clôture : plus de doublon du statut', async () => {
      const { c } = setup({
        campagne: campagne({ statut: 'CLOTUREE', dateCloture: '2026-08-27' }),
      });
      await flush();
      expect(c.topbarSubtitle()).toBe('CAMPAGNES.CLOTURE_LE 27/08');
      expect(c.topbarSubtitle()).not.toContain('CAMPAGNES.STATUT');
    });

    it('campagne CLOTUREE mais SANS date de clôture connue : repli sur le schéma statut + création', async () => {
      const { c } = setup({
        campagne: campagne({ statut: 'CLOTUREE', dateCloture: '', dateCreation: '2026-07-01' }),
      });
      await flush();
      expect(c.topbarSubtitle()).toBe('CAMPAGNES.STATUT.CLOTUREE · CAMPAGNES.CREE_LE 01/07');
    });
  });

  // ── Correction d'un relevé : mise à jour locale, pas de rechargement ───────

  describe('correction de relevé (onReleveCorrige)', () => {
    it('ouvre la feuille avec le relevé exact demandé', async () => {
      const cible = releve({ releveId: 'r-9', abonneId: 'a-9' });
      const { c } = setup();
      await flush();
      c.openCorrigerReleveSheet(cible);
      expect(c.showCorrigerReleveSheet()).toBe(true);
      expect(c.releveACorrig()).toEqual(cible);
    });

    it('applique le résultat SEULEMENT au relevé corrigé, laisse les autres intacts', async () => {
      const r1 = releve({ releveId: 'r1', abonneId: 'a-1', nouveauIndex: 120, consommation: 20, statut: 'RELEVE' });
      const r2 = releve({ releveId: 'r2', abonneId: 'a-2', nouveauIndex: 200, consommation: 40, statut: 'RELEVE' });
      const { c } = setup({ releves: [r1, r2] });
      await flush();

      c.openCorrigerReleveSheet(r1);
      const resultat: CorrigerReleveMutation['corrigerReleve'] = {
        releveId: 'r1',
        nouveauIndex: 130,
        consommation: 30,
        statut: 'RELEVE',
        audit: [],
      };
      c.onReleveCorrige(resultat);

      const [maj1, maj2] = c.releves();
      expect(maj1.nouveauIndex).toBe(130);
      expect(maj1.consommation).toBe(30);
      expect(maj2.nouveauIndex).toBe(200); // inchangé
      expect(maj2.consommation).toBe(40);
    });

    it('ferme la feuille et affiche un succès', async () => {
      const r1 = releve({ releveId: 'r1', abonneId: 'a-1' });
      const { c, success } = setup({ releves: [r1] });
      await flush();
      c.openCorrigerReleveSheet(r1);

      c.onReleveCorrige({ releveId: 'r1', nouveauIndex: 130, consommation: 30, statut: 'RELEVE', audit: [] });

      expect(c.showCorrigerReleveSheet()).toBe(false);
      expect(success).toHaveBeenCalledWith('CAMPAGNES.CORRIGER_RELEVE.SUCCESS');
    });
  });

  // ── Zones : réaffectation → rechargement des agents/répartition ───────────

  describe('onZonesSaved', () => {
    it('recharge les agents affectés et la répartition par zone', async () => {
      const { c, getAgentsCampagne, getRepartitionZone } = setup();
      await flush();
      const appelsAvant = getAgentsCampagne.mock.calls.length;

      c.onZonesSaved();
      await flush();

      expect(getAgentsCampagne.mock.calls.length).toBeGreaterThan(appelsAvant);
      expect(getRepartitionZone).toHaveBeenCalledTimes(appelsAvant + 1);
    });
  });

  describe('ouverture/fermeture des feuilles', () => {
    it('openZonesSheet retient l’agent exact ciblé', async () => {
      const { c } = setup();
      await flush();
      c.openZonesSheet({ id: 'ag-7', username: 'koffi' });
      expect(c.showZonesSheet()).toBe(true);
      expect(c.zonesAgent()).toEqual({ id: 'ag-7', username: 'koffi' });
      c.closeZonesSheet();
      expect(c.showZonesSheet()).toBe(false);
    });

    it('openAgentsSheet / closeAgentsSheet basculent uniquement leur propre signal', async () => {
      const { c } = setup();
      await flush();
      c.openAgentsSheet();
      expect(c.showAgentsSheet()).toBe(true);
      expect(c.showAbonnesSheet()).toBe(false);
      c.closeAgentsSheet();
      expect(c.showAgentsSheet()).toBe(false);
    });

    it('openAbonnesSheet / closeAbonnesSheet', async () => {
      const { c } = setup();
      await flush();
      c.openAbonnesSheet();
      expect(c.showAbonnesSheet()).toBe(true);
      c.closeAbonnesSheet();
      expect(c.showAbonnesSheet()).toBe(false);
    });
  });

  // ── Clôture : ouverture de la modale et ventilation autoritative ──────────

  describe('modale de clôture', () => {
    it('à l’ouverture, réinitialise resumeCloture puis le peuple depuis le serveur', async () => {
      const { c, getResumeCloture } = setup({ resumeClotureResult: resumeCloture({ nbFacturesAGenerer: 88 }) });
      await flush();

      c.openClotureModal();
      expect(c.clotureModalVisible()).toBe(true);
      expect(c.resumeCloture()).toBeNull(); // pas encore résolu

      await flush();
      expect(getResumeCloture).toHaveBeenCalledWith('camp-1');
      expect(c.resumeCloture()?.nbFacturesAGenerer).toBe(88);
    });

    it('un échec de ventilation laisse la modale ouverte et utilisable (repli heuristique)', async () => {
      const { c } = setup({
        resumeClotureImpl: () => Promise.reject(new Error('indisponible')),
      });
      await flush();

      c.openClotureModal();
      await flush();

      expect(c.clotureModalVisible()).toBe(true);
      expect(c.resumeCloture()).toBeNull();
    });

    it('closeClotureModal masque la modale', async () => {
      const { c } = setup();
      await flush();
      c.openClotureModal();
      c.closeClotureModal();
      expect(c.clotureModalVisible()).toBe(false);
    });

    it('onCloture ferme la modale, recharge la fiche puis affiche le succès', async () => {
      const { c, success, getProgression } = setup();
      await flush();
      c.clotureModalVisible.set(true);
      const appelsAvant = getProgression.mock.calls.length;

      await c.onCloture();

      expect(c.clotureModalVisible()).toBe(false);
      expect(getProgression.mock.calls.length).toBe(appelsAvant + 1); // load() rejoué
      expect(success).toHaveBeenCalledWith('CAMPAGNES.SUCCESS_CLOTUREE');
    });
  });

  // ── Démarrage d'une campagne planifiée ──────────────────────────────────────

  describe('demarrer', () => {
    it('démarre la campagne, recharge, puis affiche le succès', async () => {
      const { c, demarrerCampagne, success, getProgression } = setup({
        campagne: campagne({ statut: 'PLANIFIEE' }),
      });
      await flush();
      const appelsAvant = getProgression.mock.calls.length;

      await c.demarrer();

      expect(demarrerCampagne).toHaveBeenCalledWith('camp-1');
      expect(getProgression.mock.calls.length).toBe(appelsAvant + 1);
      expect(success).toHaveBeenCalledWith('CAMPAGNES.SUCCESS_DEMARREE');
      expect(c.demarrant()).toBe(false);
    });

    it('ignore un second appel pendant que le premier est en vol', async () => {
      let resolve!: (v: { campagneId: string; statut: string }) => void;
      const enVol = new Promise<{ campagneId: string; statut: string }>((r) => (resolve = r));
      const { c, demarrerCampagne } = setup({ demarrerImpl: () => enVol });
      await flush();

      const premier = c.demarrer();
      const second = c.demarrer();
      resolve({ campagneId: 'camp-1', statut: 'EN_COURS' });
      await Promise.all([premier, second]);

      expect(demarrerCampagne).toHaveBeenCalledTimes(1);
    });

    it('affiche l’erreur serveur et relève le verrou en cas d’échec', async () => {
      const { c, error } = setup({
        demarrerImpl: () => Promise.reject(new Error('La campagne est déjà en cours.')),
      });
      await flush();

      await c.demarrer();

      expect(error).toHaveBeenCalledWith('La campagne est déjà en cours.');
      expect(c.demarrant()).toBe(false);
    });
  });

  // ── Rendu minimal (l'orchestration se voit à l'écran) ──────────────────────

  describe('rendu', () => {
    it('affiche le nom et le statut de la campagne chargée', async () => {
      const { fixture } = setup({ campagne: campagne({ nom: 'Relevés Rentrée', statut: 'EN_COURS' }) });
      await flush();
      fixture.detectChanges();
      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.detail-header__nom')?.textContent).toBe('Relevés Rentrée');
    });

    it('masque le squelette de chargement une fois les données arrivées', async () => {
      const { fixture } = setup();
      await flush();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.detail-skeleton')).toBeNull();
    });

    it('n’affiche ni bouton de clôture ni bouton de démarrage pour l’AGENT', async () => {
      const { fixture } = setup({ role: 'AGENT', campagne: campagne({ statut: 'EN_COURS' }) });
      await flush();
      fixture.detectChanges();
      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.detail-header__actions')).toBeNull();
    });

    it('affiche le bouton de clôture pour un ADMIN sur une campagne EN_COURS', async () => {
      const { fixture } = setup({ role: 'ADMIN', campagne: campagne({ statut: 'EN_COURS' }) });
      await flush();
      fixture.detectChanges();
      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.btn--danger')).toBeTruthy();
    });
  });
});
