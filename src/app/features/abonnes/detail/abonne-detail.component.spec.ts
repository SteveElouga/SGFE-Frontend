import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
    const getFactures = vi.fn().mockResolvedValue(factures);
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
});
