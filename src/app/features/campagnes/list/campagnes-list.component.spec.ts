import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import fr from '../../../../../public/i18n/fr.json';
import { CampagnesListComponent } from './campagnes-list.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AgentAffecte, Campagne, Progression } from '../../../shared/models/campagne.model';
import type { GetCampagnesQuery } from '../../../graphql/generated';

/**
 * La liste des campagnes agrège trois sources : la requête `watchCampagnes`
 * (cache-and-network), et deux N+1 en arrière-plan (`getAgentsCampagne`,
 * `getProgression`) qui alimentent la colonne agents et l'avancement. Ces
 * tests couvrent les trois états de la requête principale, les filtres qui
 * combinent recherche/statut/agent, le tri des colonnes, et les deux actions
 * de cycle de vie (démarrer, clôturer).
 */
// Le type `Campagne` (domaine) plutôt que `CampagneLigne` (vue GraphQL) :
// c'est celui que le composant manipule après le cast `as Campagne[]` posé à
// la sortie de `valueChanges`, et celui qu'attendent ses méthodes
// (`agentsDe`, `nomAffichable`, les `sortValue` des colonnes). Les champs
// portés sont identiques à `CAMPAGNE_FIELDS` (voir fragments.ts).
function campagne(p: Partial<Campagne> = {}): Campagne {
  return {
    campagneId: 'c-1',
    nom: 'Août 2026',
    periodeMois: 8,
    periodeAnnee: 2026,
    statut: 'PLANIFIEE',
    datePlanifiee: '2026-08-01',
    dateCreation: '2026-07-15',
    dateCloture: '',
    createdBy: 'u-1',
    numeroMobileMoney: '',
    genererFacturesAuto: true,
    envoyerWhatsappAuto: true,
    ...p,
  };
}

function agentAffecte(p: Partial<AgentAffecte> = {}): AgentAffecte {
  return {
    agentId: 'a-1',
    username: 'jdupont',
    role: 'AGENT',
    statut: 'ACTIF',
    derniereActivite: null,
    nbReleves: 0,
    zones: [],
    ...p,
  };
}

function progression(p: Partial<Progression> = {}): Progression {
  return {
    campagneId: 'c-1',
    totalAbonnes: 10,
    nbReleves: 4,
    nbEnAttente: 6,
    pourcentage: 40,
    ...p,
  };
}

describe('CampagnesListComponent', () => {
  // Stub de QueryRef renvoyé par `CampagnesService.watchCampagnes()` — le
  // composant charge via `valueChanges` dans ngOnInit et retente via `refetch`.
  function makeQueryRef(
    campagnes: Campagne[],
    valueChanges = of({ data: { campagnes } as GetCampagnesQuery, loading: false }),
  ) {
    return {
      valueChanges,
      refetch: vi.fn().mockResolvedValue({ data: { campagnes } }),
    };
  }

  /** Flush toutes les microtâches en attente (Promise.allSettled chaînées de loadAgents/loadProgressions). */
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function setup(
    campagnes: Campagne[] = [],
    opts: {
      valueChanges?: ReturnType<typeof of>;
      role?: 'ADMIN' | 'AGENT' | 'COMPTABLE' | 'SUPERVISEUR';
      agentsParCampagne?: Record<string, AgentAffecte[]>;
      progressionsParCampagne?: Record<string, Progression>;
    } = {},
  ) {
    const queryRef = makeQueryRef(campagnes, opts.valueChanges);
    const watchCampagnes = vi.fn().mockReturnValue(queryRef);
    const cloturerCampagne = vi.fn().mockResolvedValue(undefined);
    const demarrerCampagne = vi.fn().mockResolvedValue({ campagneId: campagnes[0]?.campagneId, statut: 'EN_COURS' });
    const getAgentsCampagne = vi
      .fn()
      .mockImplementation(async (id: string) => opts.agentsParCampagne?.[id] ?? []);
    const getProgression = vi
      .fn()
      .mockImplementation(async (id: string) => opts.progressionsParCampagne?.[id] ?? progression({ campagneId: id }));

    const roleSig = signal(opts.role ?? 'ADMIN');

    TestBed.configureTestingModule({
      imports: [CampagnesListComponent],
      providers: [
        provideRouter([]),
        {
          provide: CampagnesService,
          useValue: { watchCampagnes, cloturerCampagne, demarrerCampagne, getAgentsCampagne, getProgression },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        {
          provide: AuthService,
          useValue: {
            isAdmin: computed(() => roleSig() === 'ADMIN'),
            isSuperviseur: computed(() => roleSig() === 'SUPERVISEUR'),
          },
        },
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });

    // Vraies chaînes françaises : ce qui est vérifié est ce que l'utilisateur
    // lit, et une clé manquante fait tomber le test.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(CampagnesListComponent);
    fixture.detectChanges(); // ngOnInit → souscrit à valueChanges
    await flush();
    return {
      fixture,
      component: fixture.componentInstance,
      watchCampagnes,
      cloturerCampagne,
      demarrerCampagne,
      getAgentsCampagne,
      getProgression,
      queryRef,
      router: TestBed.inject(Router),
    };
  }

  // ── Chargement ─────────────────────────────────────────────────────────────

  describe('chargement', () => {
    it('charge les campagnes et vide le loading au succès', async () => {
      const { component } = await setup([campagne(), campagne({ campagneId: 'c-2', nom: 'Sept 2026' })]);
      expect(component.campagnes()).toHaveLength(2);
      expect(component.loading()).toBe(false);
      expect(component.error()).toBeNull();
    });

    it('reste en chargement tant que la donnée n’est pas arrivée', async () => {
      const subject = new Subject<{ data: GetCampagnesQuery | undefined; loading: boolean }>();
      const { component } = await setup([], { valueChanges: subject as never });
      expect(component.loading()).toBe(true);
      expect(component.campagnes()).toHaveLength(0);

      subject.next({ data: { campagnes: [campagne()] } as GetCampagnesQuery, loading: false });
      expect(component.loading()).toBe(false);
      expect(component.campagnes()).toHaveLength(1);
    });

    it('signale une erreur GraphQL sanitizée et laisse la liste vide', async () => {
      const { component } = await setup([], {
        valueChanges: throwError(() => new Error('Le serveur est indisponible')) as never,
      });
      expect(component.error()).toBe('Le serveur est indisponible');
      expect(component.loading()).toBe(false);
      expect(component.campagnes()).toHaveLength(0);
    });

    it('affiche le message générique quand la réponse ne contient pas de données sans être en chargement', async () => {
      const { component } = await setup([], {
        valueChanges: of({ data: undefined, loading: false }) as never,
      });
      expect(component.error()).toBe('Impossible de charger les campagnes');
    });

    it('load() relance refetch et remonte son échec', async () => {
      const { component, queryRef } = await setup([campagne()]);
      queryRef.refetch.mockRejectedValueOnce(new Error('Le serveur est indisponible'));

      await component.load();

      expect(component.error()).toBe('Le serveur est indisponible');
    });

    it('load() efface l’erreur précédente avant de retenter', async () => {
      const { component, queryRef } = await setup([], {
        valueChanges: throwError(() => new Error('Le serveur est indisponible')) as never,
      });
      expect(component.error()).not.toBeNull();

      await component.load();

      expect(component.error()).toBeNull();
      expect(queryRef.refetch).toHaveBeenCalled();
    });
  });

  // ── Filtres ────────────────────────────────────────────────────────────────

  describe('filtres', () => {
    it('filtre par nom (insensible à la casse)', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', nom: 'Août 2026' }),
        campagne({ campagneId: 'c-2', nom: 'Septembre 2026' }),
      ]);
      component.searchTerm.set('août');
      expect(component.campagnesFiltrees()).toHaveLength(1);
      expect(component.campagnesFiltrees()[0].campagneId).toBe('c-1');
    });

    it('filtre par statut', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', statut: 'PLANIFIEE' }),
        campagne({ campagneId: 'c-2', statut: 'EN_COURS' }),
        campagne({ campagneId: 'c-3', statut: 'CLOTUREE' }),
      ]);
      component.filtreStatut.set('EN_COURS');
      expect(component.campagnesFiltrees()).toHaveLength(1);
      expect(component.campagnesFiltrees()[0].campagneId).toBe('c-2');
    });

    it('TOUTES ne filtre rien', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', statut: 'PLANIFIEE' }),
        campagne({ campagneId: 'c-2', statut: 'CLOTUREE' }),
      ]);
      component.filtreStatut.set('TOUTES');
      expect(component.campagnesFiltrees()).toHaveLength(2);
    });

    it('filtre par agent affecté, une fois les agents chargés', async () => {
      const { component } = await setup(
        [campagne({ campagneId: 'c-1' }), campagne({ campagneId: 'c-2' })],
        {
          agentsParCampagne: {
            'c-1': [agentAffecte({ username: 'jdupont' })],
            'c-2': [agentAffecte({ username: 'akone' })],
          },
        },
      );
      component.filtreAgent.set('akone');
      expect(component.campagnesFiltrees()).toHaveLength(1);
      expect(component.campagnesFiltrees()[0].campagneId).toBe('c-2');
    });

    it('combine recherche et statut', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', nom: 'Août 2026', statut: 'EN_COURS' }),
        campagne({ campagneId: 'c-2', nom: 'Août bis', statut: 'CLOTUREE' }),
      ]);
      component.filtreStatut.set('EN_COURS');
      component.searchTerm.set('août');
      expect(component.campagnesFiltrees()).toHaveLength(1);
      expect(component.campagnesFiltrees()[0].campagneId).toBe('c-1');
    });

    it('onFiltersChange retombe sur TOUTES quand le statut est vidé', async () => {
      const { component } = await setup([campagne()]);
      component.onFiltersChange({ statut: 'EN_COURS', agent: null });
      expect(component.filtreStatut()).toBe('EN_COURS');

      component.onFiltersChange({ statut: null, agent: null });
      expect(component.filtreStatut()).toBe('TOUTES');
    });

    it('filterValues reflète l’état courant des filtres', async () => {
      const { component } = await setup([campagne()]);
      component.filtreStatut.set('CLOTUREE');
      component.filtreAgent.set('jdupont');
      expect(component.filterValues()).toEqual({ statut: 'CLOTUREE', agent: 'jdupont' });
    });

    it('agentsDisponibles est trié et sans doublon', async () => {
      const { component } = await setup(
        [campagne({ campagneId: 'c-1' }), campagne({ campagneId: 'c-2' })],
        {
          agentsParCampagne: {
            'c-1': [agentAffecte({ username: 'zoe' }), agentAffecte({ username: 'amir' })],
            'c-2': [agentAffecte({ username: 'amir' })],
          },
        },
      );
      expect(component.agentsDisponibles().map((a) => a.value)).toEqual(['amir', 'zoe']);
    });
  });

  // ── Tri des colonnes ───────────────────────────────────────────────────────

  describe('tri', () => {
    it('la colonne campagne trie par nom', async () => {
      const { component } = await setup([campagne({ nom: 'Zèbre' })]);
      const col = component.columns.find((c) => c.key === 'campagne')!;
      expect(col.sortValue!(campagne({ nom: 'Alpha' }))).toBe('Alpha');
    });

    it('la colonne planifiée trie par date, null si absente', async () => {
      const { component } = await setup([campagne()]);
      const col = component.columns.find((c) => c.key === 'planifiee')!;
      expect(col.sortValue!(campagne({ datePlanifiee: '2026-09-01' }))).toEqual(new Date('2026-09-01'));
      expect(col.sortValue!(campagne({ datePlanifiee: '' }))).toBeNull();
    });

    it('la colonne statut trie par statut brut', async () => {
      const { component } = await setup([campagne()]);
      const col = component.columns.find((c) => c.key === 'statut')!;
      expect(col.sortValue!(campagne({ statut: 'CLOTUREE' }))).toBe('CLOTUREE');
    });

    it('la colonne avancement trie par pourcentage de progression chargée, null si pas encore chargée', async () => {
      const { component } = await setup([campagne({ campagneId: 'c-1' })], {
        progressionsParCampagne: { 'c-1': progression({ nbReleves: 5, totalAbonnes: 10 }) },
      });
      const col = component.columns.find((c) => c.key === 'avancement')!;
      expect(col.sortValue!(campagne({ campagneId: 'c-1' }))).toBe(50);
      expect(col.sortValue!(campagne({ campagneId: 'inconnue' }))).toBeNull();
    });
  });

  // ── Cas limites ────────────────────────────────────────────────────────────

  describe('cas limites', () => {
    it('liste vide : stats à zéro et sous-titre vide', async () => {
      const { component } = await setup([]);
      expect(component.stats()).toEqual({ planifiees: 0, enCours: 0, cloturees: 0, total: 0 });
      expect(component.statsSubtitle()).toBe('');
    });

    it('un seul statut représenté : le sous-titre ne mentionne que celui-ci', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', statut: 'EN_COURS' }),
        campagne({ campagneId: 'c-2', statut: 'EN_COURS' }),
      ]);
      expect(component.stats()).toEqual({ planifiees: 0, enCours: 2, cloturees: 0, total: 2 });
      expect(component.statsSubtitle()).toBe('2 campagnes · 2 en cours');
    });

    it('agentsDe rend undefined tant que le N+1 n’a pas répondu pour une campagne inconnue', async () => {
      const { component } = await setup([campagne({ campagneId: 'c-1' })]);
      expect(component.agentsDe(campagne({ campagneId: 'autre' }))).toBeUndefined();
    });

    it('formatAgents affiche un tiret sans agent, et la liste jointe sinon', async () => {
      const { component } = await setup([campagne()]);
      expect(component.formatAgents(undefined)).toBe('—');
      expect(component.formatAgents([agentAffecte({ username: 'a' }), agentAffecte({ username: 'b' })])).toBe(
        'a · b',
      );
    });

    it('nomAffichable ne suffixe pas un nom unique', async () => {
      const { component } = await setup([campagne({ campagneId: 'c-1', nom: 'Août 2026' })]);
      expect(component.nomAffichable(campagne({ campagneId: 'c-1', nom: 'Août 2026' }))).toBe('Août 2026');
    });

    it('nomAffichable suffixe les homonymes par leur date de création', async () => {
      const { component } = await setup([
        campagne({ campagneId: 'c-1', nom: 'Août 2026', dateCreation: '2026-07-15' }),
        campagne({ campagneId: 'c-2', nom: 'Août 2026', dateCreation: '2026-08-01' }),
      ]);
      expect(component.nomAffichable(campagne({ campagneId: 'c-1', nom: 'Août 2026', dateCreation: '2026-07-15' }))).toBe(
        'Août 2026 · créée le 15/07',
      );
    });

    it('progressionPct vaut 0 quand il n’y a aucun abonné', async () => {
      const { component } = await setup([campagne()]);
      expect(component.progressionPct({ nbReleves: 0, totalAbonnes: 0 })).toBe(0);
    });

    it('progressionPct arrondit le pourcentage', async () => {
      const { component } = await setup([campagne()]);
      expect(component.progressionPct({ nbReleves: 1, totalAbonnes: 3 })).toBe(33);
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  describe('navigation', () => {
    it('lienCampagne construit la route du détail', async () => {
      const { component } = await setup([campagne()]);
      expect(component['lienCampagne']({ campagneId: 'c-9' })).toEqual(['/campagnes', 'c-9']);
    });

    it('voirCampagne navigue vers le détail de la campagne', async () => {
      const { component, router } = await setup([campagne()]);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.voirCampagne('c-9');
      expect(navSpy).toHaveBeenCalledWith(['/campagnes', 'c-9']);
    });

    it('navigateToCreate navigue vers l’écran de création', async () => {
      const { component, router } = await setup([campagne()]);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.navigateToCreate();
      expect(navSpy).toHaveBeenCalledWith(['/campagnes', 'nouvelle']);
    });

    it('canCreate est vrai pour un ADMIN', async () => {
      const { component } = await setup([], { role: 'ADMIN' });
      expect(component.canCreate()).toBe(true);
    });

    it('canCreate est vrai pour un SUPERVISEUR', async () => {
      const { component } = await setup([], { role: 'SUPERVISEUR' });
      expect(component.canCreate()).toBe(true);
    });

    it('canCreate est faux pour un AGENT', async () => {
      const { component } = await setup([], { role: 'AGENT' });
      expect(component.canCreate()).toBe(false);
    });
  });

  // ── Démarrer / Clôturer ────────────────────────────────────────────────────

  describe('démarrer', () => {
    it('démarre la campagne, rafraîchit la liste et affiche un succès', async () => {
      const { component, demarrerCampagne, queryRef } = await setup([campagne({ statut: 'PLANIFIEE' })]);
      const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };

      await component.demarrer('c-1');

      expect(demarrerCampagne).toHaveBeenCalledWith('c-1');
      expect(queryRef.refetch).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
      expect(component.demarrantId()).toBeNull();
    });

    it('ignore un second démarrage tant que le premier est en vol pour cette campagne', async () => {
      const { component, demarrerCampagne } = await setup([campagne()]);
      component.demarrantId.set('c-1');

      await component.demarrer('c-1');

      expect(demarrerCampagne).not.toHaveBeenCalled();
    });

    it('affiche l’erreur serveur et relève le verrou en cas d’échec', async () => {
      const { component, demarrerCampagne } = await setup([campagne()]);
      demarrerCampagne.mockRejectedValueOnce(new Error('Le serveur est indisponible'));
      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };

      await component.demarrer('c-1');

      expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
      expect(component.demarrantId()).toBeNull();
    });
  });

  describe('clôturer', () => {
    it('clôture la campagne, rafraîchit la liste et affiche un succès', async () => {
      const { component, cloturerCampagne, queryRef } = await setup([campagne({ statut: 'EN_COURS' })]);
      const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };

      await component.cloturer('c-1');

      expect(cloturerCampagne).toHaveBeenCalledWith('c-1');
      expect(queryRef.refetch).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
      expect(component.cloturantId()).toBeNull();
    });

    it('ignore une seconde clôture tant que la première est en vol', async () => {
      const { component, cloturerCampagne } = await setup([campagne()]);
      component.cloturantId.set('c-1');

      await component.cloturer('c-1');

      expect(cloturerCampagne).not.toHaveBeenCalled();
    });

    it('affiche l’erreur serveur et relève le verrou en cas d’échec', async () => {
      const { component, cloturerCampagne } = await setup([campagne()]);
      cloturerCampagne.mockRejectedValueOnce(new Error('Le serveur est indisponible'));
      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };

      await component.cloturer('c-1');

      expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
      expect(component.cloturantId()).toBeNull();
    });
  });
});
