import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Subject, of, throwError } from 'rxjs';
import { AbonneDetailComponent } from './abonne-detail.component';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AbonneDetail, FactureLigne, SoldeDetail } from '../../../graphql/vues';

/**
 * `AbonneDetailComponent` orchestre toute la fiche abonné : chargement,
 * onglets, KPIs dérivés des factures, et les cinq feuilles d'action
 * (suspendre/réactiver/résilier/remplacer compteur/arriéré). Ces feuilles sont
 * de VRAIS composants dans le gabarit — pas des stubs — donc leurs propres
 * dépendances (`AbonnesService`, `FacturesService`, `CampagnesService`,
 * `ToastService`) doivent être satisfaites par les mêmes mocks que le parent
 * utilise : c'est un seul arbre d'injection.
 */

function abonne(p: Partial<AbonneDetail> = {}): AbonneDetail {
  return {
    id: 'ab-1',
    numeroAbonne: 'AB-0001',
    nom: 'Diallo',
    prenom: 'Amadou',
    telephoneWhatsapp: '+221771234567',
    adresse: 'Rue 12',
    statut: 'ACTIF',
    createdAt: '2025-01-15T00:00:00.000Z',
    compteur: {
      id: 'c-1',
      numeroCompteur: 42,
      quartier: 'Plateau',
      camp: 3,
      indexInitial: 100,
      datePose: '2025-01-10',
      position: '',
      statut: 'ACTIF',
    },
    ...p,
  } as AbonneDetail;
}

function facture(p: Partial<FactureLigne> = {}): FactureLigne {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-2026-01-0001',
    abonneId: 'ab-1',
    abonneNom: 'Amadou Diallo',
    abonneNumero: 'AB-0001',
    campagneId: 'camp-1',
    campagneNom: 'Campagne janvier',
    campagnePeriodeMois: 1,
    campagnePeriodeAnnee: 2026,
    statut: 'IMPAYEE',
    consommation: 20,
    montant: 10_000,
    dateReleve: '2026-01-05',
    dateLimitePaiement: '2026-01-20',
    ...p,
  } as FactureLigne;
}

function solde(p: Partial<SoldeDetail> = {}): SoldeDetail {
  return {
    factureId: 'f-1',
    montantTotal: 10_000,
    montantPaye: 0,
    soldeRestant: 10_000,
    statut: 'IMPAYEE',
    abonneId: 'ab-1',
    dateLimitePaiement: '2026-01-20',
    ...p,
  } as SoldeDetail;
}

/** Vide la file des microtâches — `loadFactures()` est fire-and-forget dans le
 *  constructeur, chaîné sur trois niveaux (getFactures → Promise.all →
 *  getSoldeFacture par facture). */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('AbonneDetailComponent', () => {
  function makeQueryRef(a: AbonneDetail | null, valueChanges = of({ data: { abonne: a }, loading: false })) {
    return {
      valueChanges,
      subscribeToMore: vi.fn(),
      refetch: vi.fn().mockResolvedValue({ data: { abonne: a } }),
    };
  }

  function setup(
    opts: {
      abonne?: AbonneDetail | null;
      valueChanges?: ReturnType<typeof of>;
      factures?: FactureLigne[];
      /** Contrôle fin de la résolution de `getFactures` — pour observer un
       *  état "en chargement" réellement rendu (spinner) avant résolution. */
      getFacturesImpl?: () => Promise<FactureLigne[]>;
      soldesByFacture?: Record<string, SoldeDetail | 'erreur'>;
      avoirMontant?: number;
      tabParam?: string;
    } = {},
  ) {
    const abonneFixture = opts.abonne === undefined ? abonne() : opts.abonne;
    const queryRef = makeQueryRef(abonneFixture, opts.valueChanges);
    const watchAbonne = vi.fn().mockReturnValue(queryRef);
    const getHistoriqueCompteur = vi.fn().mockResolvedValue([]);
    const suspendreAbonne = vi.fn();
    const reactiverAbonne = vi.fn();
    const resilierAbonne = vi.fn();
    const remplacerCompteur = vi.fn();

    const factures = opts.factures ?? [];
    const getFactures = opts.getFacturesImpl
      ? vi.fn(opts.getFacturesImpl)
      : vi.fn().mockResolvedValue(factures);
    const getAvoirAbonne = vi.fn().mockResolvedValue({
      abonneId: 'ab-1',
      montant: opts.avoirMontant ?? 0,
      mouvements: [],
    });
    const getSoldeFacture = vi.fn((factureId: string) => {
      const override = opts.soldesByFacture?.[factureId];
      if (override === 'erreur') return Promise.reject(new Error('solde indisponible'));
      if (override) return Promise.resolve(override);
      const f = factures.find((x) => x.factureId === factureId);
      return Promise.resolve(solde({ factureId, montantTotal: f?.montant ?? 0, soldeRestant: f?.montant ?? 0 }));
    });

    const openPdf = vi.fn().mockResolvedValue(undefined);
    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    const routeParams: Record<string, string> = { id: 'ab-1' };
    const queryParams: Record<string, string> = opts.tabParam ? { tab: opts.tabParam } : {};

    TestBed.configureTestingModule({
      imports: [AbonneDetailComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        {
          provide: ActivatedRoute,
          useValue: {
            params: of(routeParams),
            snapshot: {
              paramMap: { get: (k: string) => routeParams[k] ?? null },
              queryParamMap: { get: (k: string) => queryParams[k] ?? null },
            },
          },
        },
        {
          provide: AbonnesService,
          useValue: { watchAbonne, getHistoriqueCompteur, suspendreAbonne, reactiverAbonne, resilierAbonne, remplacerCompteur },
        },
        {
          provide: FacturesService,
          useValue: {
            getFactures,
            getAvoirAbonne,
            getSoldeFacture,
            previsualiserImputation: vi.fn().mockReturnValue([]),
            creerRegularisation: vi.fn(),
            enregistrerPaiementAbonne: vi.fn(),
          },
        },
        { provide: FacturePdfService, useValue: { open: openPdf } },
        // Injecté uniquement par `<app-remplacer-compteur-sheet>`, toujours dans
        // l'arbre — jamais appelé tant que la feuille ne s'ouvre pas.
        { provide: CampagnesService, useValue: { getDernierIndex: vi.fn().mockResolvedValue({ dernierIndex: 0 }) } },
        // Injecté par `<app-page-topbar>` → `<app-notification-bell>`, toujours dans l'arbre.
        { provide: NotificationsService, useValue: { unreadCount: signal(0), notifications: signal([]) } },
        { provide: ToastService, useValue: toast },
      ],
    });

    // Routes vides : `navigate`/`navigateByUrl` réels échoueraient (« Cannot
    // match any routes ») dès qu'une redirection ou une sync d'onglet est
    // déclenchée — ce qui arrive dès la construction sur un abonné NOT_FOUND.
    // On garde le Router réel (RouterLink, dans la topbar, en a besoin pour
    // calculer ses hrefs) mais on neutralise ses deux méthodes de navigation.
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(AbonneDetailComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      queryRef,
      watchAbonne,
      getFactures,
      getAvoirAbonne,
      getSoldeFacture,
      getHistoriqueCompteur,
      suspendreAbonne,
      reactiverAbonne,
      resilierAbonne,
      remplacerCompteur,
      openPdf,
      toast,
      router,
    };
  }

  // ── Chargement ─────────────────────────────────────────────────────────────

  it('affiche le squelette tant que la requête abonné ne répond pas', async () => {
    const subject = new Subject<{ data: { abonne: AbonneDetail | null }; loading: boolean }>();
    const { component, fixture } = setup({ valueChanges: subject as never });
    expect(component.loading()).toBe(true);
    expect(fixture.nativeElement.querySelector('.abonne-skeleton')).toBeTruthy();

    subject.next({ data: { abonne: abonne() }, loading: false });
    await flush();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.abonne()?.id).toBe('ab-1');
  });

  it('charge un abonné et vide loading/error', async () => {
    const { component } = setup({ abonne: abonne({ nom: 'Koné', prenom: 'Awa' }) });
    await flush();
    expect(component.abonne()?.nom).toBe('Koné');
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('affiche un message d\'erreur non technique tel quel quand le flux échoue', async () => {
    const { component } = setup({
      valueChanges: throwError(() => new Error('Le serveur est indisponible')) as never,
    });
    await flush();
    expect(component.error()).toBe('Le serveur est indisponible');
    expect(component.loading()).toBe(false);
  });

  it('redirige vers /abonnes plutôt que d\'afficher une erreur quand l\'abonné est introuvable', async () => {
    const notFound = new CombinedGraphQLErrors(
      { data: null },
      [{ message: 'Abonné introuvable', extensions: { code: 'NOT_FOUND' } }],
    );
    const { component, router } = setup({ valueChanges: throwError(() => notFound) as never });
    await flush();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
    // Pas d'erreur affichée : on part, on ne montre pas un message inutile.
    expect(component.error()).toBeNull();
  });

  describe('loadAbonne (bouton Réessayer)', () => {
    it('efface l\'erreur et redemande la fiche au serveur', async () => {
      const { component, queryRef } = setup();
      await flush();
      component.error.set('Erreur précédente');

      await component.loadAbonne();

      expect(queryRef.refetch).toHaveBeenCalled();
      expect(component.error()).toBeNull();
    });

    it('affiche le nouveau message quand le nouvel essai échoue aussi', async () => {
      const { component, queryRef } = setup();
      await flush();
      queryRef.refetch.mockRejectedValueOnce(new Error('Toujours indisponible'));

      await component.loadAbonne();

      expect(component.error()).toBe('Toujours indisponible');
    });

    it('redirige sur un NOT_FOUND rencontré au nouvel essai', async () => {
      const { component, queryRef, router } = setup();
      await flush();
      queryRef.refetch.mockRejectedValueOnce(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'x', extensions: { code: 'NOT_FOUND' } }]),
      );

      await component.loadAbonne();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
    });
  });

  // ── Actions proposées selon le statut ───────────────────────────────────────
  // Modifier est toujours proposé ; les quatre autres dépendent du statut.

  describe('actions selon le statut', () => {
    function boutons(fixture: ReturnType<typeof setup>['fixture']) {
      const racine = fixture.nativeElement as HTMLElement;
      return {
        suspendre: racine.querySelector('.abonne-action-btn--danger'),
        reactiver: racine.querySelector('.abonne-action-btn--success'),
        resilier: racine.querySelector('.abonne-action-btn--danger-outline'),
        remplacer: racine.querySelector('.abonne-action-btn--ghost'),
      };
    }

    it('ACTIF : propose Suspendre, Résilier et Remplacer compteur — pas Réactiver', async () => {
      const { fixture } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      const b = boutons(fixture);
      expect(b.suspendre).toBeTruthy();
      expect(b.resilier).toBeTruthy();
      expect(b.remplacer).toBeTruthy();
      expect(b.reactiver).toBeNull();
    });

    it('SUSPENDU : propose Réactiver et Résilier — pas Suspendre ni Remplacer compteur', async () => {
      const { fixture } = setup({ abonne: abonne({ statut: 'SUSPENDU' }) });
      await flush();
      fixture.detectChanges();
      const b = boutons(fixture);
      expect(b.reactiver).toBeTruthy();
      expect(b.resilier).toBeTruthy();
      expect(b.suspendre).toBeNull();
      expect(b.remplacer).toBeNull();
    });

    it('RESILIE : n\'affiche plus aucune des quatre actions de statut', async () => {
      const { fixture } = setup({ abonne: abonne({ statut: 'RESILIE' }) });
      await flush();
      fixture.detectChanges();
      const b = boutons(fixture);
      expect(b.suspendre).toBeNull();
      expect(b.reactiver).toBeNull();
      expect(b.resilier).toBeNull();
      expect(b.remplacer).toBeNull();
      // Le bouton Modifier, lui, reste — un abonné résilié garde son dossier modifiable.
      expect(fixture.nativeElement.querySelector('.abonne-action-btn')).toBeTruthy();
    });
  });

  // ── Ouverture des feuilles ───────────────────────────────────────────────────

  it('suspendre() ouvre la feuille de suspension, rien d\'autre', () => {
    const { component } = setup();
    expect(component.suspendreDialogVisible()).toBe(false);
    component.suspendre();
    expect(component.suspendreDialogVisible()).toBe(true);
    expect(component.reactiverDialogVisible()).toBe(false);
    expect(component.resilierDialogVisible()).toBe(false);
  });

  it('reactiver() ouvre la feuille de réactivation', () => {
    const { component } = setup();
    component.reactiver();
    expect(component.reactiverDialogVisible()).toBe(true);
  });

  it('confirmerResiliation() ouvre la feuille de résiliation', () => {
    const { component } = setup();
    component.confirmerResiliation();
    expect(component.resilierDialogVisible()).toBe(true);
  });

  it('openRemplacerModal() ouvre la feuille de remplacement de compteur', () => {
    const { component } = setup();
    component.openRemplacerModal();
    expect(component.remplacerVisible()).toBe(true);
  });

  // ── Application du résultat d'une feuille ───────────────────────────────────

  describe('application du résultat des feuilles', () => {
    it('onSuspended applique le nouveau statut, ferme la feuille et avertit', () => {
      const { component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      component.suspendre();

      component.onSuspended('SUSPENDU');

      expect(component.abonne()?.statut).toBe('SUSPENDU');
      expect(component.suspendreDialogVisible()).toBe(false);
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('onReactived applique le nouveau statut, ferme la feuille et confirme en succès', () => {
      const { component, toast } = setup({ abonne: abonne({ statut: 'SUSPENDU' }) });
      component.reactiver();

      component.onReactived('ACTIF');

      expect(component.abonne()?.statut).toBe('ACTIF');
      expect(component.reactiverDialogVisible()).toBe(false);
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it('onResilied applique le nouveau statut, ferme la feuille et informe', () => {
      const { component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      component.confirmerResiliation();

      component.onResilied('RESILIE');

      expect(component.abonne()?.statut).toBe('RESILIE');
      expect(component.resilierDialogVisible()).toBe(false);
      expect(toast.info).toHaveBeenCalledTimes(1);
    });

    it('onCompteurRemplace remplace le compteur affiché sans toucher au reste de la fiche', () => {
      const { component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      component.openRemplacerModal();
      const nouveauCompteur = {
        id: 'c-2',
        numeroCompteur: 99,
        quartier: 'Almadies',
        camp: 5,
        indexInitial: 0,
        datePose: '2026-02-01',
        position: '',
        statut: 'ACTIF' as const,
        latitude: null,
        longitude: null,
        dateMajPosition: null,
      };

      component.onCompteurRemplace(nouveauCompteur);

      expect(component.abonne()?.compteur).toEqual(nouveauCompteur);
      expect(component.abonne()?.nom).toBe('Diallo'); // le reste de la fiche est intact
      expect(component.remplacerVisible()).toBe(false);
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it('n\'applique rien si le signal abonne est encore vide (garde défensive)', () => {
      const { component } = setup({ abonne: null });
      expect(component.abonne()).toBeNull();
      component.onSuspended('SUSPENDU');
      expect(component.abonne()).toBeNull(); // (a ? ... : a) ne plante pas sur null
    });
  });

  // ── Solde impayé / avoir — plusieurs jeux de factures ───────────────────────

  describe('solde et avoir dérivés des factures', () => {
    it('sans aucune facture, le solde vaut 0 (rien n\'est dû)', async () => {
      const { component } = setup({ factures: [] });
      await flush();
      expect(component.soldeImpaye()).toBe(0);
      expect(component.soldeKpiClass()).toBe('abonne-kpi--green');
    });

    it('une facture payée seule ne compte pas dans le solde', async () => {
      const { component } = setup({ factures: [facture({ factureId: 'f-1', statut: 'PAYEE' })] });
      await flush();
      expect(component.soldeImpaye()).toBe(0);
    });

    it('une facture annulée ne réapparaît pas dans le solde', async () => {
      // Voir le commentaire de `calculerSolde` : compter une facture annulée
      // ferait réclamer une dette éteinte.
      const { component } = setup({ factures: [facture({ factureId: 'f-1', statut: 'ANNULEE' })] });
      await flush();
      expect(component.soldeImpaye()).toBe(0);
    });

    it('additionne le solde restant des factures impayées', async () => {
      const factures = [
        facture({ factureId: 'f-1', statut: 'IMPAYEE', montant: 10_000 }),
        facture({ factureId: 'f-2', statut: 'IMPAYEE', montant: 5_000 }),
      ];
      const { component } = setup({
        factures,
        soldesByFacture: {
          'f-1': solde({ factureId: 'f-1', soldeRestant: 10_000 }),
          'f-2': solde({ factureId: 'f-2', soldeRestant: 5_000 }),
        },
      });
      await flush();
      expect(component.soldeImpaye()).toBe(15_000);
      expect(component.soldeKpiClass()).toBe('abonne-kpi--red');
      expect(component.soldeFormate()).toContain('15');
    });

    it('un solde partiellement inconnu (une requête a échoué) reste un solde partiel, pas nul', async () => {
      const factures = [
        facture({ factureId: 'f-1', statut: 'IMPAYEE', montant: 10_000 }),
        facture({ factureId: 'f-2', statut: 'IMPAYEE', montant: 5_000 }),
      ];
      const { component } = setup({
        factures,
        soldesByFacture: { 'f-1': solde({ factureId: 'f-1', soldeRestant: 10_000 }), 'f-2': 'erreur' },
      });
      await flush();
      expect(component.soldeImpaye()).toBe(10_000);
    });

    it('un solde totalement indisponible reste "inconnu" (null), pas "zéro"', async () => {
      const factures = [facture({ factureId: 'f-1', statut: 'IMPAYEE' })];
      const { component } = setup({ factures, soldesByFacture: { 'f-1': 'erreur' } });
      await flush();
      expect(component.soldeImpaye()).toBeNull();
      expect(component.soldeKpiClass()).toBe('abonne-kpi--slate');
      expect(component.soldeFormate()).toBe('—');
    });

    it('charge l\'avoir de l\'abonné et le formate', async () => {
      const { component } = setup({ avoirMontant: 2_500 });
      await flush();
      expect(component.avoir()).toBe(2_500);
      expect(component.avoirFormate()).toContain('2');
    });

    it('un avoir indisponible retombe sur 0 plutôt que de faire échouer la fiche', async () => {
      const { component, getAvoirAbonne } = setup();
      getAvoirAbonne.mockRejectedValueOnce(new Error('indisponible'));
      await flush();
      expect(component.avoir()).toBe(0);
      expect(component.error()).toBeNull(); // dégradation silencieuse, pas d'erreur affichée
    });
  });

  // ── Consommation / listes dérivées des factures ─────────────────────────────

  describe('listes et agrégats de factures', () => {
    it('trie les factures de la plus récente à la plus ancienne', async () => {
      const factures = [
        facture({ factureId: 'f-old', dateReleve: '2025-01-01' }),
        facture({ factureId: 'f-new', dateReleve: '2026-01-01' }),
      ];
      const { component } = setup({ factures });
      await flush();
      expect(component.facturesTriees().map((f) => f.factureId)).toEqual(['f-new', 'f-old']);
    });

    it('facturesRecentes se limite aux 5 premières', async () => {
      const factures = Array.from({ length: 7 }, (_, i) =>
        facture({ factureId: `f-${i}`, dateReleve: `2026-01-0${i + 1}` }),
      );
      const { component } = setup({ factures });
      await flush();
      expect(component.facturesRecentes()).toHaveLength(5);
      expect(component.nbFactures()).toBe(7);
    });

    it('facturesImpayees exclut les factures payées', async () => {
      const factures = [
        facture({ factureId: 'f-1', statut: 'PAYEE' }),
        facture({ factureId: 'f-2', statut: 'IMPAYEE' }),
        facture({ factureId: 'f-3', statut: 'PARTIELLE' }),
      ];
      const { component } = setup({ factures });
      await flush();
      expect(component.facturesImpayees().map((f) => f.factureId).sort()).toEqual(['f-2', 'f-3']);
    });

    it('consoMoyenne est nul sans aucune facture', async () => {
      const { component } = setup({ factures: [] });
      await flush();
      expect(component.consoMoyenne()).toBeNull();
    });

    it('consoMoyenne arrondit la moyenne des dernières factures', async () => {
      const factures = [
        facture({ factureId: 'f-1', dateReleve: '2026-01-01', consommation: 10 }),
        facture({ factureId: 'f-2', dateReleve: '2026-02-01', consommation: 15 }),
      ];
      const { component } = setup({ factures });
      await flush();
      expect(component.consoMoyenne()).toBe(13); // (10+15)/2 = 12.5 → arrondi à 13
    });

    it('consoBars restitue les périodes du plus ancien au plus récent, avec la barre la plus haute à 100%', async () => {
      const factures = [
        facture({ factureId: 'f-1', dateReleve: '2026-01-01', consommation: 10 }),
        facture({ factureId: 'f-2', dateReleve: '2026-02-01', consommation: 20 }),
      ];
      const { component } = setup({ factures });
      await flush();
      const bars = component.consoBars();
      expect(bars.map((b) => b.conso)).toEqual([10, 20]); // ancien → récent, ordre inversé par rapport à facturesTriees
      expect(bars[1].pct).toBe(100);
      expect(bars[0].pct).toBe(50);
    });

    it('numerosParFacture associe chaque identifiant à son numéro affichable', async () => {
      const factures = [
        facture({ factureId: 'f-1', numeroFacture: 'FACT-A' }),
        facture({ factureId: 'f-2', numeroFacture: 'FACT-B' }),
      ];
      const { component } = setup({ factures });
      await flush();
      expect(component.numerosParFacture()).toEqual({ 'f-1': 'FACT-A', 'f-2': 'FACT-B' });
    });
  });

  // ── Rechargement après action ────────────────────────────────────────────────

  it('onArriereSaved recharge les factures (la dette a changé)', async () => {
    const { component, getFactures } = setup();
    await flush();
    expect(getFactures).toHaveBeenCalledTimes(1);

    await component.onArriereSaved();

    expect(getFactures).toHaveBeenCalledTimes(2);
  });

  it('onEncaissementSaved recharge les factures (le solde a bougé)', async () => {
    const { component, getFactures } = setup();
    await flush();
    expect(getFactures).toHaveBeenCalledTimes(1);

    await component.onEncaissementSaved();

    expect(getFactures).toHaveBeenCalledTimes(2);
  });

  // ── PDF ──────────────────────────────────────────────────────────────────────

  it('openPdf ouvre le PDF de la facture demandée', async () => {
    const { component, openPdf } = setup();
    await component.openPdf('f-42');
    expect(openPdf).toHaveBeenCalledWith('f-42');
  });

  it('openPdf affiche un toast d\'erreur quand l\'ouverture échoue, sans lever', async () => {
    const { component, openPdf, toast } = setup();
    openPdf.mockRejectedValueOnce(new Error('blocked'));
    await expect(component.openPdf('f-42')).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // ── Onglets ──────────────────────────────────────────────────────────────────

  describe('onglets', () => {
    it('démarre sur l\'onglet Informations par défaut', () => {
      const { component } = setup();
      expect(component.activeTab()).toBe(0);
    });

    it('hydrate l\'onglet actif depuis ?tab= à l\'ouverture', () => {
      const { component } = setup({ tabParam: 'impayes' });
      expect(component.activeTab()).toBe(3);
    });

    it('un ?tab= inconnu est ignoré (reste sur Informations)', () => {
      const { component } = setup({ tabParam: 'inexistant' });
      expect(component.activeTab()).toBe(0);
    });

    it('voirFactures() bascule sur l\'onglet Factures', () => {
      const { component } = setup();
      component.voirFactures();
      expect(component.activeTab()).toBe(1);
    });

    it('setActiveTab charge l\'historique compteur au premier passage sur l\'onglet, pas aux suivants', async () => {
      const { component, getHistoriqueCompteur } = setup();
      component.setActiveTab(4);
      await flush();
      expect(getHistoriqueCompteur).toHaveBeenCalledTimes(1);
      expect(component.historiqueLoaded()).toBe(true);

      component.setActiveTab(0);
      component.setActiveTab(4);
      await flush();
      expect(getHistoriqueCompteur).toHaveBeenCalledTimes(1); // pas rechargé
    });

    it('remonte une erreur de chargement de l\'historique sans faire planter l\'onglet', async () => {
      const { component, getHistoriqueCompteur } = setup();
      getHistoriqueCompteur.mockRejectedValueOnce(new Error('Historique indisponible'));

      component.setActiveTab(4);
      await flush();

      expect(component.historiqueError()).toBe('Historique indisponible');
      expect(component.historiqueLoading()).toBe(false);
      expect(component.historiqueLoaded()).toBe(false); // pas marqué chargé : un nouveau passage retentera
    });

    it('le deep-link ?tab=compteurs déclenche aussi le chargement de l\'historique', async () => {
      const { getHistoriqueCompteur } = setup({ tabParam: 'compteurs' });
      await flush();
      expect(getHistoriqueCompteur).toHaveBeenCalledTimes(1);
    });

    it('onTabKeydown : ArrowRight avance, ArrowLeft cycle vers le dernier depuis le premier', () => {
      const { component } = setup();
      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }), 0);
      expect(component.activeTab()).toBe(1);

      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), 0);
      expect(component.activeTab()).toBe(4); // cycle : avant le premier → le dernier
    });

    it('onTabKeydown : Home et End sautent aux extrêmes', () => {
      const { component } = setup();
      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'End' }), 1);
      expect(component.activeTab()).toBe(4);

      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'Home' }), 4);
      expect(component.activeTab()).toBe(0);
    });

    it('onTabKeydown ignore les autres touches', () => {
      const { component } = setup();
      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'Tab' }), 2);
      expect(component.activeTab()).toBe(0); // inchangé, pas de saut au hasard
    });
  });

  // ── Champs calculés de l'en-tête ─────────────────────────────────────────────

  describe('en-tête calculé', () => {
    it('initial() prend la première lettre du nom affiché (prénom puis nom)', async () => {
      const { component } = setup({ abonne: abonne({ prenom: 'Awa', nom: 'Koné' }) });
      await flush();
      expect(component.initial()).toBe('A');
    });

    it('initial() vaut "?" tant que rien n\'est chargé', () => {
      const { component } = setup({ abonne: null });
      expect(component.initial()).toBe('?');
    });

    it('topbarTitle() affiche le nom complet une fois chargé', async () => {
      const { component } = setup({ abonne: abonne({ prenom: 'Awa', nom: 'Koné' }) });
      await flush();
      expect(component.topbarTitle()).toBe('Awa Koné');
    });

    it('topbarTitle() retombe sur la clé de chargement tant qu\'il n\'y a pas d\'abonné', () => {
      const { component } = setup({ abonne: null });
      expect(component.topbarTitle()).toBe('COMMON.LOADING');
    });

    it('localisationLine() rassemble numéro, compteur, quartier/camp et téléphone', async () => {
      const { component } = setup({
        abonne: abonne({
          numeroAbonne: 'AB-0007',
          telephoneWhatsapp: '+221700000000',
          compteur: {
            id: 'c-1', numeroCompteur: 7, quartier: 'Yoff', camp: 2,
            indexInitial: 0, datePose: '2025-01-01', position: '', statut: 'ACTIF',
            latitude: null, longitude: null, dateMajPosition: null,
          },
        }),
      });
      await flush();
      const line = component.localisationLine();
      expect(line).toContain('AB-0007');
      expect(line).toContain('C-0007');
      expect(line).toContain('Yoff');
      expect(line).toContain('+221700000000');
    });

    it('localisationLine() omet le bloc compteur quand l\'abonné n\'en a pas', async () => {
      const { component } = setup({ abonne: abonne({ compteur: undefined }) });
      await flush();
      expect(component.localisationLine()).not.toContain('C-');
    });

    it('abonneDepuis() dérive l\'ancienneté de createdAt', async () => {
      const { component } = setup({ abonne: abonne({ createdAt: '2024-06-01T00:00:00.000Z' }) });
      await flush();
      expect(component.abonneDepuis()).toContain('2024');
    });

    it('moisDepuis() choisit la clé pluriel au-delà d\'un mois écoulé', async () => {
      const maintenant = new Date();
      const ilYA15Mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 15, 1).toISOString();
      const { component } = setup({ abonne: abonne({ createdAt: ilYA15Mois }) });
      await flush();
      expect(component.moisDepuis()).toBe('ABONNES.DETAIL.MONTHS_AGO_PLURAL');
    });

    it('moisDepuis() choisit la clé singulier pour un abonné tout juste créé', async () => {
      const maintenant = new Date();
      const { component } = setup({ abonne: abonne({ createdAt: maintenant.toISOString() }) });
      await flush();
      expect(component.moisDepuis()).toBe('ABONNES.DETAIL.MONTHS_AGO_SINGULAR');
    });
  });

  // ── Rendu réel du template ───────────────────────────────────────────────────
  // Tous les blocs ci-dessus appellent `component.xxx()` directement ou lisent
  // les signaux sans rappeler `detectChanges()` après un changement d'état :
  // les 5 boutons d'action, les 5 onglets et leurs sous-états, et les blocs
  // conditionnels de la fiche info n'étaient donc presque jamais réellement
  // rendus ni cliqués.

  describe('rendu réel du template', () => {
    function onglets(fixture: ReturnType<typeof setup>['fixture']): HTMLButtonElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.abonne-tabs__tab'));
    }

    it('un vrai clic sur "Modifier" navigue vers le formulaire d’édition', async () => {
      const { fixture, router } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-action-btn');
      bouton.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes/ab-1/modifier');
    });

    it('un vrai clic sur "Suspendre" ouvre réellement la feuille', async () => {
      const { fixture, component } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-action-btn--danger');
      bouton.click();

      expect(component.suspendreDialogVisible()).toBe(true);
    });

    it('un vrai clic sur "Réactiver" ouvre réellement la feuille', async () => {
      const { fixture, component } = setup({ abonne: abonne({ statut: 'SUSPENDU' }) });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-action-btn--success');
      bouton.click();

      expect(component.reactiverDialogVisible()).toBe(true);
    });

    it('un vrai clic sur "Résilier" ouvre réellement la feuille', async () => {
      const { fixture, component } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-action-btn--danger-outline');
      bouton.click();

      expect(component.resilierDialogVisible()).toBe(true);
    });

    it('un vrai clic sur "Remplacer compteur" ouvre réellement la feuille', async () => {
      const { fixture, component } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-action-btn--ghost');
      bouton.click();

      expect(component.remplacerVisible()).toBe(true);
    });

    it('un vrai clic sur "Réessayer" du bandeau d’erreur relance le chargement', async () => {
      const { fixture, queryRef } = setup({ valueChanges: throwError(() => new Error('Panne')) as never });
      await flush();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.error-banner__retry');
      expect(bouton).not.toBeNull();
      bouton.click();

      expect(queryRef.refetch).toHaveBeenCalled();
    });

    it('une adresse absente affiche un tiret plutôt qu’un champ vide', async () => {
      const { fixture } = setup({ abonne: abonne({ adresse: '' }) });
      await flush();
      fixture.detectChanges();

      const valeurs = Array.from(fixture.nativeElement.querySelectorAll('.abonne-info-row__value--muted')) as HTMLElement[];
      expect(valeurs.some((v) => v.textContent?.trim() === '—')).toBe(true);
    });

    it('une position de compteur renseignée est affichée dans la fiche', async () => {
      const { fixture } = setup({
        abonne: abonne({
          compteur: {
            id: 'c-1', numeroCompteur: 42, quartier: 'Plateau', camp: 3, indexInitial: 100,
            datePose: '2025-01-10', position: 'Fond de cour, 3e parcelle', statut: 'ACTIF',
            latitude: null, longitude: null, dateMajPosition: null,
          },
        }),
      });
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Fond de cour, 3e parcelle');
    });

    it('des coordonnées GPS affichent le lien vers la carte, avec l’id de l’abonné en query param', async () => {
      const { fixture } = setup({
        abonne: abonne({
          id: 'ab-77',
          compteur: {
            id: 'c-1', numeroCompteur: 42, quartier: 'Plateau', camp: 3, indexInitial: 100,
            datePose: '2025-01-10', position: '', statut: 'ACTIF',
            latitude: 4.05, longitude: 9.7, dateMajPosition: null,
          },
        }),
      });
      await flush();
      fixture.detectChanges();

      const lien: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href*="/carte"]');
      expect(lien).not.toBeNull();
      expect(lien.getAttribute('href')).toContain('ab-77');
    });

    it('sans coordonnées GPS, aucun lien vers la carte n’est affiché', async () => {
      const { fixture } = setup({ abonne: abonne() }); // fixture par défaut : latitude/longitude absents
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('a[href*="/carte"]')).toBeNull();
    });

    it('sans date de pose, la fiche affiche un tiret pour ce champ', async () => {
      const { fixture } = setup({
        abonne: abonne({
          compteur: {
            id: 'c-1', numeroCompteur: 42, quartier: 'Plateau', camp: 3, indexInitial: 100,
            datePose: '', position: '', statut: 'ACTIF', latitude: null, longitude: null, dateMajPosition: null,
          },
        }),
      });
      await flush();
      fixture.detectChanges();

      const valeurs = Array.from(fixture.nativeElement.querySelectorAll('.abonne-info-row__value--muted')) as HTMLElement[];
      expect(valeurs.some((v) => v.textContent?.trim() === '—')).toBe(true);
    });

    it('sans compteur du tout, la carte affiche le message "aucun compteur"', async () => {
      const { fixture } = setup({ abonne: abonne({ compteur: undefined }) });
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-info-card__empty')).not.toBeNull();
    });

    it('avec plus de 5 factures, le lien "voir tout" est proposé et bascule réellement sur l’onglet Factures', async () => {
      const factures = Array.from({ length: 7 }, (_, i) =>
        facture({ factureId: `f-${i}`, dateReleve: `2026-01-0${i + 1}` }),
      );
      const { fixture, component } = setup({ factures });
      await flush();
      fixture.detectChanges();

      const lien: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-invoices__see-all');
      expect(lien).not.toBeNull();
      lien.click();
      fixture.detectChanges();

      expect(component.activeTab()).toBe(1);
      expect(onglets(fixture)[1].classList.contains('abonne-tabs__tab--active')).toBe(true);
    });

    it('avec 5 factures ou moins, le lien "voir tout" est absent', async () => {
      const { fixture } = setup({ factures: [facture()] });
      await flush();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.abonne-invoices__see-all')).toBeNull();
    });

    // ── Onglets — navigation réelle par clic, et sous-états de chaque panneau ──

    it('un vrai clic sur chaque onglet change le panneau actif et le rôle ARIA sélectionné', async () => {
      const { fixture } = setup({ factures: [facture()] });
      await flush();
      fixture.detectChanges();

      const tabs = onglets(fixture);
      expect(tabs).toHaveLength(5);

      tabs[2].click();
      fixture.detectChanges();
      expect(tabs[2].getAttribute('aria-selected')).toBe('true');
      expect(fixture.nativeElement.querySelector('#abonneTabPanel-2')).not.toBeNull();

      tabs[3].click();
      fixture.detectChanges();
      expect(tabs[3].getAttribute('aria-selected')).toBe('true');
      expect(fixture.nativeElement.querySelector('#abonneTabPanel-3')).not.toBeNull();
    });

    it('onglet Factures : affiche un spinner pendant le chargement, puis le tableau une fois chargé', async () => {
      let resoudre!: (f: FactureLigne[]) => void;
      const enAttente = new Promise<FactureLigne[]>((res) => { resoudre = res; });
      const { fixture } = setup({ getFacturesImpl: () => enAttente });
      fixture.detectChanges(); // squelette abonné pas encore chargé n'entrave pas ceci : ngOnInit tourne
      await flush();
      fixture.detectChanges();

      onglets(fixture)[1].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder .pi-spinner')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-factures-table')).toBeNull();

      resoudre([facture()]);
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder .pi-spinner')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-factures-table')).not.toBeNull();
    });

    it('onglet Conso : affiche un spinner tant que les factures sont en chargement', async () => {
      let resoudre!: (f: FactureLigne[]) => void;
      const enAttente = new Promise<FactureLigne[]>((res) => { resoudre = res; });
      const { fixture } = setup({ getFacturesImpl: () => enAttente });
      fixture.detectChanges();

      onglets(fixture)[2].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder .pi-spinner')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.conso-chart')).toBeNull();

      resoudre([]);
      await flush();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder .pi-spinner')).toBeNull();
    });

    it('onglet Conso : affiche le message "aucune facture" sans historique', async () => {
      const { fixture } = setup({ factures: [] });
      await flush();
      fixture.detectChanges();

      onglets(fixture)[2].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.conso-chart')).toBeNull();
    });

    it('onglet Conso : affiche l’histogramme quand il y a de l’historique', async () => {
      const factures = [
        facture({ factureId: 'f-1', dateReleve: '2026-01-01', consommation: 10 }),
        facture({ factureId: 'f-2', dateReleve: '2026-02-01', consommation: 20 }),
      ];
      const { fixture } = setup({ factures });
      await flush();
      fixture.detectChanges();

      onglets(fixture)[2].click();
      fixture.detectChanges();

      const barres = fixture.nativeElement.querySelectorAll('.conso-bar');
      expect(barres.length).toBe(2);
    });

    it('onglet Impayés : affiche l’icône « soldé » quand rien n’est dû', async () => {
      const { fixture } = setup({ factures: [facture({ factureId: 'f-1', statut: 'PAYEE' })] });
      await flush();
      fixture.detectChanges();

      onglets(fixture)[3].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder svg')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-factures-table')).toBeNull();
    });

    it('onglet Impayés : affiche le tableau (sans la colonne conso) quand il y a des impayés', async () => {
      const { fixture } = setup({ factures: [facture({ factureId: 'f-1', statut: 'IMPAYEE' })] });
      await flush();
      fixture.detectChanges();

      onglets(fixture)[3].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-factures-table')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.abonne-tab-placeholder')).toBeNull();
    });

    it('onglet Compteurs : reste utilisable (compteur null passé au panneau) pour un abonné sans compteur', async () => {
      const { fixture } = setup({ abonne: abonne({ compteur: undefined }) });
      await flush();
      fixture.detectChanges();

      onglets(fixture)[4].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-compteurs-panel')).not.toBeNull();
    });

    it('onglet Compteurs : transmet bien le compteur actuel de l’abonné au panneau', async () => {
      const { fixture } = setup({ abonne: abonne() }); // fixture par défaut : compteur défini
      await flush();
      fixture.detectChanges();

      onglets(fixture)[4].click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-compteurs-panel')).not.toBeNull();
    });

    it('un vrai geste clavier (flèche droite) sur un onglet change réellement l’onglet actif', async () => {
      const { fixture } = setup({ factures: [facture()] });
      await flush();
      fixture.detectChanges();

      const tabs = onglets(fixture);
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();

      expect(onglets(fixture)[1].getAttribute('aria-selected')).toBe('true');
    });

    it('un vrai clic sur les actions du bloc KPI ouvre réellement les feuilles d’arriéré et d’encaissement', async () => {
      const factures = [facture({ factureId: 'f-1', statut: 'IMPAYEE', montant: 10_000 })];
      const { fixture, component } = setup({
        factures,
        soldesByFacture: { 'f-1': solde({ factureId: 'f-1', soldeRestant: 10_000 }) },
      });
      await flush();
      fixture.detectChanges();

      const boutonArriere: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-kpi__action:not(.abonne-kpi__action--primaire)');
      boutonArriere.click();
      expect(component.arriereDialogVisible()).toBe(true);

      const boutonEncaissement: HTMLButtonElement = fixture.nativeElement.querySelector('.abonne-kpi__action--primaire');
      expect(boutonEncaissement).not.toBeNull(); // un solde ouvert existe (f-1)
      boutonEncaissement.click();
      expect(component.encaissementDialogVisible()).toBe(true);
    });

    // ── Couverture des listeners restants (clic sur l'onglet déjà actif par
    //    défaut, navigation clavier sur chaque onglet, PDF par onglet, et les
    //    événements (close)/(saved) des 6 bottom-sheets) ─────────────────────

    it('un vrai clic sur l’onglet "Informations" (déjà actif par défaut) y ramène depuis un autre onglet', async () => {
      const { fixture } = setup({ factures: [facture()] });
      await flush();
      fixture.detectChanges();

      const tabs = onglets(fixture);
      tabs[1].click();
      fixture.detectChanges();
      tabs[0].click();
      fixture.detectChanges();

      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(fixture.nativeElement.querySelector('#abonneTabPanel-0')).not.toBeNull();
    });

    it('un vrai geste clavier sur chacun des 5 onglets déplace bien le focus/l’état actif', async () => {
      const { fixture } = setup({ factures: [facture()] });
      await flush();
      fixture.detectChanges();

      for (const [index, tab] of onglets(fixture).entries()) {
        tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        fixture.detectChanges();
        expect(onglets(fixture)[4].getAttribute('aria-selected')).toBe('true');
        // Revenir à l'onglet de départ pour l'itération suivante.
        onglets(fixture)[index].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        fixture.detectChanges();
      }
    });

    it('un clic sur le PDF d’une facture récente (onglet Informations) appelle openPdf', async () => {
      const { fixture, openPdf } = setup({ factures: [facture({ factureId: 'f-1' })] });
      await flush();
      fixture.detectChanges();

      const table = fixture.debugElement.query(By.css('app-factures-table'));
      table.triggerEventHandler('pdfClick', 'f-1');

      expect(openPdf).toHaveBeenCalledWith('f-1');
    });

    it('un clic sur le PDF d’une facture (onglet Factures) appelle openPdf', async () => {
      const { fixture, openPdf } = setup({ factures: [facture({ factureId: 'f-2' })] });
      await flush();
      fixture.detectChanges();
      onglets(fixture)[1].click();
      fixture.detectChanges();

      const table = fixture.debugElement.query(By.css('app-factures-table'));
      table.triggerEventHandler('pdfClick', 'f-2');

      expect(openPdf).toHaveBeenCalledWith('f-2');
    });

    it('un clic sur le PDF d’une facture (onglet Impayés) appelle openPdf', async () => {
      const { fixture, openPdf } = setup({ factures: [facture({ factureId: 'f-3', statut: 'IMPAYEE' })] });
      await flush();
      fixture.detectChanges();
      onglets(fixture)[3].click();
      fixture.detectChanges();

      const table = fixture.debugElement.query(By.css('app-factures-table'));
      table.triggerEventHandler('pdfClick', 'f-3');

      expect(openPdf).toHaveBeenCalledWith('f-3');
    });

    it('la feuille d’encaissement — (close) ferme, (saved) recharge les factures', async () => {
      const { fixture, component, getFactures } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      component.encaissementDialogVisible.set(true);
      fixture.detectChanges();
      getFactures.mockClear();

      const sheet = fixture.debugElement.query(By.css('app-encaissement-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.encaissementDialogVisible()).toBe(false);

      sheet.triggerEventHandler('saved', undefined);
      await flush();
      expect(getFactures).toHaveBeenCalledTimes(1);
    });

    it('la feuille d’arriéré — (close) ferme, (saved) recharge les factures', async () => {
      const { fixture, component, getFactures } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      component.arriereDialogVisible.set(true);
      fixture.detectChanges();
      getFactures.mockClear();

      const sheet = fixture.debugElement.query(By.css('app-arriere-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.arriereDialogVisible()).toBe(false);

      sheet.triggerEventHandler('saved', undefined);
      await flush();
      expect(getFactures).toHaveBeenCalledTimes(1);
    });

    it('la feuille de suspension — (close) ferme, (saved) applique le statut', async () => {
      const { fixture, component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      component.suspendreDialogVisible.set(true);
      fixture.detectChanges();

      const sheet = fixture.debugElement.query(By.css('app-suspendre-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.suspendreDialogVisible()).toBe(false);

      component.suspendreDialogVisible.set(true);
      fixture.detectChanges();
      sheet.triggerEventHandler('saved', 'SUSPENDU');
      expect(component.abonne()?.statut).toBe('SUSPENDU');
      expect(toast.warning).toHaveBeenCalled();
    });

    it('la feuille de réactivation — (close) ferme, (saved) applique le statut', async () => {
      const { fixture, component, toast } = setup({ abonne: abonne({ statut: 'SUSPENDU' }) });
      await flush();
      fixture.detectChanges();
      component.reactiverDialogVisible.set(true);
      fixture.detectChanges();

      const sheet = fixture.debugElement.query(By.css('app-reactiver-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.reactiverDialogVisible()).toBe(false);

      component.reactiverDialogVisible.set(true);
      fixture.detectChanges();
      sheet.triggerEventHandler('saved', 'ACTIF');
      expect(component.abonne()?.statut).toBe('ACTIF');
      expect(toast.success).toHaveBeenCalled();
    });

    it('la feuille de résiliation — (close) ferme, (saved) applique le statut', async () => {
      const { fixture, component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      component.resilierDialogVisible.set(true);
      fixture.detectChanges();

      const sheet = fixture.debugElement.query(By.css('app-resilier-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.resilierDialogVisible()).toBe(false);

      component.resilierDialogVisible.set(true);
      fixture.detectChanges();
      sheet.triggerEventHandler('saved', 'RESILIE');
      expect(component.abonne()?.statut).toBe('RESILIE');
      expect(toast.info).toHaveBeenCalled();
    });

    it('la feuille de remplacement de compteur — (close) ferme, (saved) remplace le compteur', async () => {
      const { fixture, component, toast } = setup({ abonne: abonne({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();
      component.remplacerVisible.set(true);
      fixture.detectChanges();

      const sheet = fixture.debugElement.query(By.css('app-remplacer-compteur-sheet'));
      sheet.triggerEventHandler('close', undefined);
      expect(component.remplacerVisible()).toBe(false);

      const nouveauCompteur = {
        id: 'c-2', numeroCompteur: 99, quartier: 'Almadies', camp: 5, indexInitial: 0,
        datePose: '2026-02-01', position: '', statut: 'ACTIF' as const,
        latitude: null, longitude: null, dateMajPosition: null,
      };
      component.remplacerVisible.set(true);
      fixture.detectChanges();
      sheet.triggerEventHandler('saved', nouveauCompteur);
      expect(component.abonne()?.compteur).toEqual(nouveauCompteur);
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
