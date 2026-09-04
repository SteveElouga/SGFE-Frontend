import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import fr from '../../../../../public/i18n/fr.json';
import { CampagneFormComponent } from './campagne-form.component';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import { GET_ABONNES_ACTIFS } from '../../../graphql/queries/abonnes.queries';
import type { AgentDisponible } from '../../../shared/models/campagne.model';
import type { GetAbonnesActifsQuery } from '../../../graphql/generated';

/**
 * Créer une campagne enchaîne trois écritures (création, rattachement des
 * abonnés, affectation des agents) derrière un seul bouton : une erreur sur
 * l'une doit empêcher les suivantes plutôt que laisser la campagne à moitié
 * configurée. Ces tests couvrent la validité du formulaire (dates, zones,
 * Mobile Money), le payload exact envoyé à `creerCampagne`, le choix entre
 * `affecterAgent` et `affecterZones` par agent, et la redirection au succès.
 */
type AbonneActifFixture = GetAbonnesActifsQuery['abonnesActifs'][number];

function abonneActif(p: Partial<AbonneActifFixture> = {}): AbonneActifFixture {
  return {
    id: 'ab-1',
    compteur: { quartier: 'Plateau', camp: 1 },
    ...p,
  };
}

function agentDisponible(p: Partial<AgentDisponible> = {}): AgentDisponible {
  return {
    id: 'ag-1',
    username: 'jdupont',
    phoneNumber: '699000000',
    role: 'AGENT',
    isActive: true,
    ...p,
  };
}

describe('CampagneFormComponent', () => {
  /**
   * Flush les microtâches en attente (`loadAgents` est un `void async`
   * fire-and-forget). Basé sur `Promise.resolve()` plutôt que `setTimeout` :
   * un test peut activer `vi.useFakeTimers()` (pré-remplissage de la date), et
   * un macrotâche simulé ne se résoudrait jamais sans avance explicite.
   */
  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  }

  async function setup(
    opts: {
      abonnesActifs?: AbonneActifFixture[];
      abonnesActifsValueChanges?: ReturnType<typeof of>;
      agentsDisponibles?: AgentDisponible[];
      creerCampagne?: ReturnType<typeof vi.fn>;
      ajouterAbonnesCampagne?: ReturnType<typeof vi.fn>;
      affecterAgent?: ReturnType<typeof vi.fn>;
      affecterZones?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const creerCampagne =
      opts.creerCampagne ??
      vi.fn().mockResolvedValue({
        campagneId: 'c-new',
        nom: 'Septembre 2026',
        statut: 'PLANIFIEE',
        periodeMois: 9,
        periodeAnnee: 2026,
        datePlanifiee: '2026-09-01',
        dateCreation: '2026-08-15',
        dateCloture: '',
      });
    const ajouterAbonnesCampagne =
      opts.ajouterAbonnesCampagne ?? vi.fn().mockResolvedValue({ nbAjoutes: 0, nbIgnores: 0 });
    const affecterAgent =
      opts.affecterAgent ?? vi.fn().mockResolvedValue({ campagneId: 'c-new', nom: 'x', statut: 'PLANIFIEE' });
    const affecterZones = opts.affecterZones ?? vi.fn().mockResolvedValue([]);
    const getAgentsDisponibles = vi.fn().mockResolvedValue(opts.agentsDisponibles ?? []);

    const watchQuery = vi.fn().mockReturnValue({
      valueChanges: opts.abonnesActifsValueChanges ?? of({ data: { abonnesActifs: opts.abonnesActifs ?? [] } }),
    });

    TestBed.configureTestingModule({
      imports: [CampagneFormComponent],
      providers: [
        provideRouter([]),
        {
          provide: CampagnesService,
          useValue: { getAgentsDisponibles, creerCampagne, ajouterAbonnesCampagne, affecterAgent, affecterZones },
        },
        { provide: Apollo, useValue: { watchQuery } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });

    // Vraies chaînes françaises : ce qui est vérifié est ce que l'utilisateur
    // lit (submitLabel), et une clé manquante fait tomber le test.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(CampagneFormComponent);
    fixture.detectChanges(); // ngOnInit → charge agents + abonnés actifs
    await flush();
    return {
      fixture,
      component: fixture.componentInstance,
      creerCampagne,
      ajouterAbonnesCampagne,
      affecterAgent,
      affecterZones,
      getAgentsDisponibles,
      watchQuery,
      router: TestBed.inject(Router),
      toast: TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> },
    };
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  describe('initialisation', () => {
    afterEach(() => vi.useRealTimers());

    it('pré-remplit le nom et la date planifiée avec le 1er du mois suivant', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 15)); // 15 août 2026

      const { component } = await setup();

      expect(component.formNom()).toBe('Septembre 2026');
      const date = component.formDatePlanifiee();
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(8); // septembre, 0-indexé
      expect(date?.getDate()).toBe(1);
    });

    it('le formulaire est déjà valide au montage (nom et date auto-remplis, mode TOUS)', async () => {
      const { component } = await setup();
      expect(component.formValid()).toBe(true);
    });

    it('interroge GET_ABONNES_ACTIFS en cache-and-network', async () => {
      const { watchQuery } = await setup();
      expect(watchQuery).toHaveBeenCalledWith(
        expect.objectContaining({ query: GET_ABONNES_ACTIFS, fetchPolicy: 'cache-and-network' }),
      );
    });

    it('ne charge que les agents actifs', async () => {
      const { component } = await setup({
        agentsDisponibles: [
          agentDisponible({ id: 'a1', username: 'actif1', isActive: true }),
          agentDisponible({ id: 'a2', username: 'inactif', isActive: false }),
          agentDisponible({ id: 'a3', username: 'actif2', isActive: true }),
        ],
      });
      expect(component.agents()).toEqual([
        { id: 'a1', username: 'actif1', role: 'AGENT' },
        { id: 'a3', username: 'actif2', role: 'AGENT' },
      ]);
    });

    it('une erreur au chargement des agents reste silencieuse (non critique)', async () => {
      const getAgentsDisponibles = vi.fn().mockRejectedValue(new Error('boom'));
      TestBed.configureTestingModule({
        imports: [CampagneFormComponent],
        providers: [
          provideRouter([]),
          {
            provide: CampagnesService,
            useValue: {
              getAgentsDisponibles,
              creerCampagne: vi.fn(),
              ajouterAbonnesCampagne: vi.fn(),
              affecterAgent: vi.fn(),
              affecterZones: vi.fn(),
            },
          },
          { provide: Apollo, useValue: { watchQuery: vi.fn().mockReturnValue({ valueChanges: of({ data: { abonnesActifs: [] } }) }) } },
          { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
          provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        ],
      });
      const fixture = TestBed.createComponent(CampagneFormComponent);
      expect(() => fixture.detectChanges()).not.toThrow();
      await flush();
      expect(fixture.componentInstance.agents()).toEqual([]);
    });

    it('nbAbonnesActifs reste null tant que la requête n’a pas répondu', async () => {
      const subject = new Subject<{ data: GetAbonnesActifsQuery }>();
      const { component } = await setup({ abonnesActifsValueChanges: subject as never });

      expect(component.nbAbonnesActifs()).toBeNull();

      subject.next({ data: { abonnesActifs: [abonneActif(), abonneActif({ id: 'ab-2' })] } });
      expect(component.nbAbonnesActifs()).toBe(2);
    });

    it('une erreur sur les abonnés actifs vide la liste plutôt que de la laisser indéfinie', async () => {
      const { component } = await setup({
        abonnesActifsValueChanges: throwError(() => new Error('boom')) as never,
      });
      expect(component.abonnesActifs()).toEqual([]);
      expect(component.nbAbonnesActifs()).toBe(0);
    });
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  describe('validation du formulaire', () => {
    it('devient invalide si le nom est vidé (espaces compris)', async () => {
      const { component } = await setup();
      component.formNom.set('   ');
      expect(component.formValid()).toBe(false);
    });

    it('devient invalide si la date planifiée est effacée', async () => {
      const { component } = await setup();
      component.formDatePlanifiee.set(null);
      expect(component.formValid()).toBe(false);
    });

    it('mode FILTRE sans zone cochée invalide le formulaire', async () => {
      const { component } = await setup({ abonnesActifs: [abonneActif()] });
      component.selectSelectionMode('FILTRE');
      expect(component.formValid()).toBe(false);
    });

    it('mode FILTRE avec au moins une zone cochée revalide le formulaire', async () => {
      const { component } = await setup({ abonnesActifs: [abonneActif()] });
      component.selectSelectionMode('FILTRE');
      const zone = component.zonesDisponibles()[0];
      component.toggleZone(zone.key);
      expect(component.formValid()).toBe(true);
    });

    it('un Mobile Money de 9 chiffres est valide', async () => {
      const { component } = await setup();
      component.formMobileMoney.set('612345678');
      expect(component.mobileMoneyValid()).toBe(true);
      expect(component.formValid()).toBe(true);
    });

    it('un Mobile Money incomplet invalide le formulaire', async () => {
      const { component } = await setup();
      component.formMobileMoney.set('12345');
      expect(component.mobileMoneyValid()).toBe(false);
      expect(component.formValid()).toBe(false);
    });

    it('un Mobile Money non numérique est invalide', async () => {
      const { component } = await setup();
      component.formMobileMoney.set('61234567a');
      expect(component.mobileMoneyValid()).toBe(false);
    });

    it('un Mobile Money vide reste valide (champ optionnel)', async () => {
      const { component } = await setup();
      component.formMobileMoney.set('   ');
      expect(component.mobileMoneyValid()).toBe(true);
    });

    it('envoyerWhatsappEffectif est forcé à faux si la génération de facture est désactivée', async () => {
      const { component } = await setup();
      expect(component.envoyerWhatsappAuto()).toBe(true);
      component.genererFacturesAuto.set(false);
      expect(component.envoyerWhatsappEffectif()).toBe(false);
      // Le signal sous-jacent n'est pas altéré : il se réactive si on rallume la génération.
      component.genererFacturesAuto.set(true);
      expect(component.envoyerWhatsappEffectif()).toBe(true);
    });

    it('submitLabel combine le préfixe traduit et le nom saisi', async () => {
      const { component } = await setup();
      component.formNom.set('Octobre 2026');
      expect(component.submitLabel()).toBe('Créer la campagne Octobre 2026');
    });

    it('submitLabel ne laisse pas d’espace final quand le nom est vide', async () => {
      const { component } = await setup();
      component.formNom.set('   ');
      expect(component.submitLabel()).toBe('Créer la campagne');
    });
  });

  // ── Zones disponibles / sélection des abonnés ─────────────────────────────

  describe('zones et sélection des abonnés', () => {
    it('dérive les zones (quartier, camp) dédupliquées et triées, en ignorant les abonnés sans quartier', async () => {
      const { component } = await setup({
        abonnesActifs: [
          abonneActif({ id: '1', compteur: { quartier: 'Plateau', camp: 1 } }),
          abonneActif({ id: '2', compteur: { quartier: 'Plateau', camp: 1 } }),
          abonneActif({ id: '3', compteur: { quartier: 'Bastos', camp: 2 } }),
          abonneActif({ id: '4', compteur: { quartier: '', camp: 1 } }),
        ],
      });
      expect(component.zonesDisponibles()).toEqual([
        { key: 'Bastos##2', quartier: 'Bastos', camp: 2, count: 1 },
        { key: 'Plateau##1', quartier: 'Plateau', camp: 1, count: 2 },
      ]);
    });

    it('nbAbonnesFiltres vaut le total en mode TOUS', async () => {
      const { component } = await setup({
        abonnesActifs: [abonneActif({ id: '1' }), abonneActif({ id: '2' })],
      });
      expect(component.nbAbonnesFiltres()).toBe(2);
    });

    it('nbAbonnesFiltres vaut 0 en mode FILTRE tant qu’aucune zone n’est cochée', async () => {
      const { component } = await setup({ abonnesActifs: [abonneActif()] });
      component.selectSelectionMode('FILTRE');
      expect(component.nbAbonnesFiltres()).toBe(0);
    });

    it('nbAbonnesFiltres ne compte que les abonnés des zones cochées', async () => {
      const { component } = await setup({
        abonnesActifs: [
          abonneActif({ id: '1', compteur: { quartier: 'Plateau', camp: 1 } }),
          abonneActif({ id: '2', compteur: { quartier: 'Plateau', camp: 1 } }),
          abonneActif({ id: '3', compteur: { quartier: 'Bastos', camp: 2 } }),
        ],
      });
      component.selectSelectionMode('FILTRE');
      component.toggleZone('Plateau##1');
      expect(component.nbAbonnesFiltres()).toBe(2);
    });

    it('toggleZone retire une zone déjà cochée', async () => {
      const { component } = await setup({ abonnesActifs: [abonneActif()] });
      component.selectSelectionMode('FILTRE');
      component.toggleZone('Plateau##1');
      expect(component.selectedZones().has('Plateau##1')).toBe(true);
      component.toggleZone('Plateau##1');
      expect(component.selectedZones().has('Plateau##1')).toBe(false);
    });
  });

  // ── Agents et zones par agent ──────────────────────────────────────────────

  describe('agents et zones par agent', () => {
    it('toggleAgent déplace l’agent entre disponibles et sélectionnés', async () => {
      const { component } = await setup({ agentsDisponibles: [agentDisponible({ id: 'ag-1' })] });
      expect(component.availableAgents()).toHaveLength(1);

      component.toggleAgent('ag-1');
      expect(component.selectedAgents().map((a) => a.id)).toEqual(['ag-1']);
      expect(component.availableAgents()).toHaveLength(0);

      component.toggleAgent('ag-1');
      expect(component.selectedAgents()).toHaveLength(0);
    });

    it('removeAgent efface aussi les zones affectées à cet agent', async () => {
      const { component } = await setup({
        agentsDisponibles: [agentDisponible({ id: 'ag-1' })],
        abonnesActifs: [abonneActif({ compteur: { quartier: 'Plateau', camp: 1 } })],
      });
      component.toggleAgent('ag-1');
      component.toggleAgentZone('ag-1', 'Plateau##1');
      expect(component.agentZoneCount('ag-1')).toBe(1);

      component.removeAgent('ag-1');

      expect(component.selectedAgents()).toHaveLength(0);
      expect(component.agentZoneCount('ag-1')).toBe(0);
      expect(component.isAgentZoneSelected('ag-1', 'Plateau##1')).toBe(false);
    });

    it('toggleAgentZone coche puis décoche une zone pour un agent donné', async () => {
      const { component } = await setup({
        agentsDisponibles: [agentDisponible({ id: 'ag-1' })],
        abonnesActifs: [abonneActif({ compteur: { quartier: 'Plateau', camp: 1 } })],
      });
      component.toggleAgent('ag-1');

      component.toggleAgentZone('ag-1', 'Plateau##1');
      expect(component.isAgentZoneSelected('ag-1', 'Plateau##1')).toBe(true);

      component.toggleAgentZone('ag-1', 'Plateau##1');
      expect(component.isAgentZoneSelected('ag-1', 'Plateau##1')).toBe(false);
    });
  });

  // ── Soumission ─────────────────────────────────────────────────────────────

  describe('soumission', () => {
    function preparer(component: CampagneFormComponent, nom = 'Campagne Test'): void {
      component.formNom.set(nom);
      component.formDatePlanifiee.set(new Date(2026, 8, 15)); // 15 septembre 2026
    }

    it('envoie le payload CreateCampagneInput exact (mode TOUS, options par défaut)', async () => {
      const { component, creerCampagne } = await setup();
      preparer(component);

      await component.submit();

      expect(creerCampagne).toHaveBeenCalledWith({
        nom: 'Campagne Test',
        periodeMois: 9,
        periodeAnnee: 2026,
        datePlanifiee: '2026-09-15',
        numeroMobileMoney: '',
        genererFacturesAuto: true,
        envoyerWhatsappAuto: true,
        demarrerMaintenant: false,
      });
    });

    it('transmet numeroMobileMoney nettoyé, les options et demarrerMaintenant', async () => {
      const { component, creerCampagne } = await setup();
      preparer(component);
      component.formMobileMoney.set('  612345678  ');
      component.genererFacturesAuto.set(false);
      component.demarrerMaintenant.set(true);

      await component.submit();

      expect(creerCampagne).toHaveBeenCalledWith(
        expect.objectContaining({
          numeroMobileMoney: '612345678',
          genererFacturesAuto: false,
          envoyerWhatsappAuto: false, // forcé à faux : dépend de genererFacturesAuto
          demarrerMaintenant: true,
        }),
      );
    });

    it('rattache tous les abonnés actifs en mode TOUS', async () => {
      const { component, ajouterAbonnesCampagne } = await setup({
        abonnesActifs: [abonneActif({ id: 'ab-1' }), abonneActif({ id: 'ab-2' })],
      });
      preparer(component);

      await component.submit();

      expect(ajouterAbonnesCampagne).toHaveBeenCalledWith('c-new', ['ab-1', 'ab-2']);
    });

    it('ne rattache personne s’il n’y a aucun abonné actif', async () => {
      const { component, ajouterAbonnesCampagne } = await setup({ abonnesActifs: [] });
      preparer(component);

      await component.submit();

      expect(ajouterAbonnesCampagne).not.toHaveBeenCalled();
    });

    it('en mode FILTRE, ne rattache que les abonnés des zones cochées', async () => {
      const { component, ajouterAbonnesCampagne } = await setup({
        abonnesActifs: [
          abonneActif({ id: 'ab-1', compteur: { quartier: 'Plateau', camp: 1 } }),
          abonneActif({ id: 'ab-2', compteur: { quartier: 'Bastos', camp: 2 } }),
        ],
      });
      preparer(component);
      component.selectSelectionMode('FILTRE');
      component.toggleZone('Plateau##1');

      await component.submit();

      expect(ajouterAbonnesCampagne).toHaveBeenCalledWith('c-new', ['ab-1']);
    });

    it('affecte un agent sans zone cochée via affecterAgent, pas affecterZones', async () => {
      const { component, affecterAgent, affecterZones } = await setup({
        agentsDisponibles: [agentDisponible({ id: 'ag-1' })],
      });
      preparer(component);
      component.toggleAgent('ag-1');

      await component.submit();

      expect(affecterAgent).toHaveBeenCalledWith('c-new', 'ag-1');
      expect(affecterZones).not.toHaveBeenCalled();
    });

    it('affecte les zones cochées d’un agent via affecterZones, pas affecterAgent', async () => {
      const { component, affecterAgent, affecterZones } = await setup({
        agentsDisponibles: [agentDisponible({ id: 'ag-1' })],
        abonnesActifs: [abonneActif({ compteur: { quartier: 'Plateau', camp: 1 } })],
      });
      preparer(component);
      component.toggleAgent('ag-1');
      component.toggleAgentZone('ag-1', 'Plateau##1');

      await component.submit();

      expect(affecterZones).toHaveBeenCalledWith('c-new', 'ag-1', [{ quartier: 'Plateau', camp: 1 }]);
      expect(affecterAgent).not.toHaveBeenCalled();
    });

    it('traite chaque agent sélectionné indépendamment (l’un avec zones, l’autre sans)', async () => {
      const { component, affecterAgent, affecterZones } = await setup({
        agentsDisponibles: [agentDisponible({ id: 'ag-1' }), agentDisponible({ id: 'ag-2', username: 'akone' })],
        abonnesActifs: [abonneActif({ compteur: { quartier: 'Plateau', camp: 1 } })],
      });
      preparer(component);
      component.toggleAgent('ag-1');
      component.toggleAgent('ag-2');
      component.toggleAgentZone('ag-1', 'Plateau##1');
      // ag-2 : aucune zone cochée.

      await component.submit();

      expect(affecterZones).toHaveBeenCalledWith('c-new', 'ag-1', [{ quartier: 'Plateau', camp: 1 }]);
      expect(affecterAgent).toHaveBeenCalledWith('c-new', 'ag-2');
    });

    it('affiche un succès et redirige vers /campagnes', async () => {
      const { component, toast, router } = await setup();
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      preparer(component);

      await component.submit();

      expect(toast.success).toHaveBeenCalled();
      expect(navSpy).toHaveBeenCalledWith(['/campagnes']);
    });

    it('n’appelle pas le service si le formulaire est invalide', async () => {
      const { component, creerCampagne } = await setup();
      component.formNom.set('');

      await component.submit();

      expect(creerCampagne).not.toHaveBeenCalled();
    });

    it('ignore une soumission tant qu’une autre est déjà en cours', async () => {
      const { component, creerCampagne } = await setup();
      preparer(component);
      component.submitting.set(true);

      await component.submit();

      expect(creerCampagne).not.toHaveBeenCalled();
    });

    it('affiche l’erreur serveur et relève le verrou en cas d’échec de création', async () => {
      const creerCampagne = vi.fn().mockRejectedValue(new Error('Le serveur est indisponible'));
      const { component, toast } = await setup({ creerCampagne });
      preparer(component);

      await component.submit();

      expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
      expect(component.submitting()).toBe(false);
    });

    it('un échec du rattachement des abonnés interrompt l’affectation des agents', async () => {
      const ajouterAbonnesCampagne = vi.fn().mockRejectedValue(new Error('Le serveur est indisponible'));
      const { component, affecterAgent, affecterZones, toast } = await setup({
        ajouterAbonnesCampagne,
        agentsDisponibles: [agentDisponible({ id: 'ag-1' })],
        abonnesActifs: [abonneActif()],
      });
      preparer(component);
      component.toggleAgent('ag-1');

      await component.submit();

      expect(affecterAgent).not.toHaveBeenCalled();
      expect(affecterZones).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Le serveur est indisponible');
    });

    it('submitting repasse à faux après un succès', async () => {
      const { component } = await setup();
      preparer(component);

      await component.submit();

      expect(component.submitting()).toBe(false);
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  describe('annuler', () => {
    it('navigue vers /campagnes sans appeler le service', async () => {
      const { component, creerCampagne, router } = await setup();
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.annuler();

      expect(navSpy).toHaveBeenCalledWith(['/campagnes']);
      expect(creerCampagne).not.toHaveBeenCalled();
    });
  });
});
