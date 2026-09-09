import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { FacturesListComponent } from './factures-list.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import { DetteAbonne } from '../../../shared/models/facture.model';
import type { FactureLigne } from '../../../graphql/vues';

/** Complète les champs propres au repli « campagnes dérivées des factures »
 *  (redirection sans campagne dans l'URL, sélecteur multi-campagnes). */
function ligneAvecCampagne(p: Partial<FactureLigne> & { campagneId: string }): FactureLigne {
  return facture({ campagneNom: '', campagnePeriodeMois: 1, campagnePeriodeAnnee: 2026, ...p });
}

/**
 * La colonne « solde » ne parle que de la facture qu'on lit. Un abonné qui
 * doit 20 500 sur août et 3 000 sur juillet affichait 20 500 — et on encaissait
 * en croyant solder un compte qui restait débiteur de 3 000.
 *
 * Ces tests portent sur les deux réponses apportées : l'annotation qui dit ce
 * que l'abonné doit ailleurs, et la distinction entre « pas encore chargé » et
 * « n'a pas pu être chargé », qui avaient jusqu'ici la même apparence.
 */
function facture(p: Partial<FactureLigne> = {}): FactureLigne {
  return {
    factureId: 'f-1',
    abonneId: 'a-1',
    numeroFacture: 'FACT-2026-08-001',
    montant: 20500,
    statut: 'IMPAYEE',
    ...p,
  } as FactureLigne;
}

function dette(p: Partial<DetteAbonne> = {}): DetteAbonne {
  return { totalDu: 23500, nbFactures: 2, plusAncienneEcheance: '2026-06-15', ...p };
}

describe('FacturesListComponent — ce que l’abonné doit ailleurs', () => {
  function creer() {
    TestBed.configureTestingModule({
      imports: [FacturesListComponent],
      providers: [
        provideTranslateService({}),
        {
          provide: FacturesService,
          useValue: { getSoldeFacture: vi.fn(), getDetteAbonne: vi.fn() },
        },
        { provide: FacturePdfService, useValue: {} },
        { provide: CampagnesService, useValue: { list: vi.fn().mockResolvedValue([]) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: { subscribe: () => of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(new Map()), snapshot: { paramMap: new Map() } },
        },
      ],
    });
    // Pas de detectChanges : `ngOnInit` déclencherait les chargements réseau.
    // Les méthodes testées ici sont pures vis-à-vis des signaux.
    return TestBed.createComponent(FacturesListComponent).componentInstance;
  }

  it('annonce ce que l’abonné doit sur ses autres factures', () => {
    const c = creer();
    c.soldes.set(new Map([['f-1', 20500]]));
    c.dettes.set(new Map([['a-1', dette({ totalDu: 23500 })]]));

    expect(c.autresDettesFor(facture())).toBe(3000);
  });

  it('se tait quand cette facture est toute la dette', () => {
    const c = creer();
    c.soldes.set(new Map([['f-1', 20500]]));
    c.dettes.set(new Map([['a-1', dette({ totalDu: 20500, nbFactures: 1 })]]));

    // Une annotation qui s'afficherait sur chaque ligne ne signalerait plus rien.
    expect(c.autresDettesFor(facture())).toBeNull();
  });

  it('se tait tant que la dette n’est pas chargée', () => {
    const c = creer();
    c.soldes.set(new Map([['f-1', 20500]]));

    expect(c.autresDettesFor(facture())).toBeNull();
  });

  it('se tait quand le solde de la ligne est inconnu', () => {
    const c = creer();
    c.dettes.set(new Map([['a-1', dette()]]));

    // Sans le solde de cette facture, la soustraction donnerait la dette
    // entière : on annoncerait « doit 23 500 ailleurs » sur la seule ligne qui
    // en porte déjà 20 500.
    expect(c.autresDettesFor(facture())).toBeNull();
  });

  it('ne compte pas la facture courante dans le nombre d’autres factures', () => {
    const c = creer();
    c.dettes.set(new Map([['a-1', dette({ nbFactures: 3 })]]));

    expect(c.autresFacturesFor(facture())).toBe(2);
  });

  it('distingue un solde en erreur d’un solde en cours de chargement', () => {
    const c = creer();
    const f = facture();

    expect(c.soldeEnErreur(f)).toBe(false);
    expect(c.soldeFor(f)).toBeNull();

    c.soldesEnErreur.set(new Set(['f-1']));
    expect(c.soldeEnErreur(f)).toBe(true);
  });

  it('une facture soldée n’a ni solde ni annotation', () => {
    const c = creer();
    const f = facture({ statut: 'PAYEE' });
    c.dettes.set(new Map([['a-1', dette({ totalDu: 3000, nbFactures: 1 })]]));

    expect(c.soldeFor(f)).toBe(0);
    // 3 000 dus ailleurs, 0 sur celle-ci : l'annotation a du sens et vaut 3 000.
    expect(c.autresDettesFor(f)).toBe(3000);
  });
});

describe('FacturesListComponent — pagination serveur', () => {
  /** Laisse les microtâches de `load()` (chaîne d'`await`/promesses en vol
   *  côté ngOnInit) se résoudre avant d'inspecter l'état du composant. */
  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  function creer(opts: {
    getFactures: ReturnType<typeof vi.fn>;
    getFacturesCount: ReturnType<typeof vi.fn>;
    getSoldeFacture?: ReturnType<typeof vi.fn>;
    getDetteAbonne?: ReturnType<typeof vi.fn>;
    getCampagne?: ReturnType<typeof vi.fn>;
    genererFactures?: ReturnType<typeof vi.fn>;
    envoyerToutesFacturesWhatsapp?: ReturnType<typeof vi.fn>;
    renvoyerFactureWhatsapp?: ReturnType<typeof vi.fn>;
    pdfOpen?: ReturnType<typeof vi.fn>;
  }) {
    TestBed.configureTestingModule({
      imports: [FacturesListComponent],
      providers: [
        provideTranslateService({}),
        {
          provide: FacturesService,
          useValue: {
            getFactures: opts.getFactures,
            getFacturesCount: opts.getFacturesCount,
            getSoldeFacture: opts.getSoldeFacture ?? vi.fn().mockResolvedValue({ soldeRestant: 0 }),
            getDetteAbonne:
              opts.getDetteAbonne ??
              vi.fn().mockResolvedValue({ totalDu: 0, nbFactures: 0, plusAncienneEcheance: '' }),
            genererFactures: opts.genererFactures ?? vi.fn().mockResolvedValue({}),
            envoyerToutesFacturesWhatsapp:
              opts.envoyerToutesFacturesWhatsapp ?? vi.fn().mockResolvedValue({}),
            renvoyerFactureWhatsapp: opts.renvoyerFactureWhatsapp ?? vi.fn().mockResolvedValue({}),
          },
        },
        { provide: FacturePdfService, useValue: { open: opts.pdfOpen ?? vi.fn().mockResolvedValue(undefined) } },
        {
          provide: CampagnesService,
          useValue: { getCampagne: opts.getCampagne ?? vi.fn().mockRejectedValue(new Error('n/a')) },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: { subscribe: () => of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { params: of({ campagneId: 'camp-1' }) },
        },
      ],
    });
    return TestBed.createComponent(FacturesListComponent);
  }

  function defaultCounts(overrides: Partial<Record<string, number>> = {}) {
    return vi.fn((params: { statut?: string }) =>
      Promise.resolve(overrides[params.statut ?? 'TOTAL'] ?? 0),
    );
  }

  it('charge la page 0 avec limit/offset au montage (mode serveur par défaut)', async () => {
    const getFactures = vi.fn().mockResolvedValue([]);
    const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
    fixture.detectChanges();
    await flush();

    expect(fixture.componentInstance.modeServeur()).toBe(true);
    expect(getFactures).toHaveBeenCalledWith({
      campagneId: 'camp-1',
      statut: undefined,
      limit: fixture.componentInstance.PAGE_SIZE,
      offset: 0,
    });
  });

  it('onPageChange recharge avec le bon offset', async () => {
    const getFactures = vi.fn().mockResolvedValue([]);
    const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
    fixture.detectChanges();
    await flush();
    getFactures.mockClear();

    fixture.componentInstance.onPageChange(2);
    await flush();

    expect(getFactures).toHaveBeenCalledWith({
      campagneId: 'camp-1',
      statut: undefined,
      limit: fixture.componentInstance.PAGE_SIZE,
      offset: 2 * fixture.componentInstance.PAGE_SIZE,
    });
  });

  it('onStatutChange revient en page 0 et filtre côté serveur', async () => {
    const getFactures = vi.fn().mockResolvedValue([]);
    const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
    fixture.detectChanges();
    await flush();
    fixture.componentInstance.onPageChange(3);
    await flush();
    getFactures.mockClear();

    fixture.componentInstance.onStatutChange('IMPAYEE');
    await flush();

    expect(fixture.componentInstance.pageIndex()).toBe(0);
    expect(getFactures).toHaveBeenCalledWith({
      campagneId: 'camp-1',
      statut: 'IMPAYEE',
      limit: fixture.componentInstance.PAGE_SIZE,
      offset: 0,
    });
  });

  it('une recherche active bascule en chargement complet (mode client, sans limit/offset)', async () => {
    const getFactures = vi.fn().mockResolvedValue([]);
    const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
    fixture.detectChanges();
    await flush();
    getFactures.mockClear();

    fixture.componentInstance.onSearchChange('dupont');
    await flush();

    expect(fixture.componentInstance.modeServeur()).toBe(false);
    expect(getFactures).toHaveBeenCalledWith({ campagneId: 'camp-1', statut: undefined });
  });

  it('facturesAEnvoyer compte sur la campagne entière (compteurs globaux), pas la page affichée', async () => {
    // La page à l'écran ne contient qu'une facture PAYEE — si le compte
    // relisait `factures()` comme avant la pagination, il vaudrait 0.
    const getFactures = vi.fn().mockResolvedValue([facture({ statut: 'PAYEE' })]);
    const getFacturesCount = defaultCounts({ IMPAYEE: 5, PARTIELLE: 2 });
    const fixture = creer({ getFactures, getFacturesCount });
    fixture.detectChanges();
    await flush();

    expect(fixture.componentInstance.facturesAEnvoyer()).toBe(7);
  });

  it('n’affiche ni PDF ni « + Paiement » pour une facture annulée', async () => {
    // `@else` couvrait auparavant tout statut différent de PAYEE — une
    // facture ANNULEE (solde toujours à zéro, aucun reçu) se retrouvait donc
    // avec un bouton « + Paiement » actif dans le tableau.
    const getFactures = vi.fn().mockResolvedValue([facture({ statut: 'ANNULEE' })]);
    const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('[aria-label]')).map((el) =>
      (el as Element).getAttribute('aria-label'),
    );
    expect(labels).not.toContain('FACTURATION.ACTION_PAIEMENT');
    expect(labels).not.toContain('FACTURATION.ACTION_PDF');
  });

  it('les puces de statut reflètent les compteurs globaux, pas la page affichée', async () => {
    const getFactures = vi.fn().mockResolvedValue([facture({ statut: 'PAYEE' })]);
    const getFacturesCount = defaultCounts({ IMPAYEE: 5, PARTIELLE: 2, PAYEE: 40 });
    const fixture = creer({ getFactures, getFacturesCount });
    fixture.detectChanges();
    await flush();

    const chip = fixture.componentInstance.filtersConfig().find((f) => f.key === 'statut');
    expect(chip?.options.find((o) => o.value === 'IMPAYEE')?.count).toBe(5);
    expect(chip?.options.find((o) => o.value === 'PAYEE')?.count).toBe(40);
  });

  // ── Objet campagne, nom de repli ──────────────────────────────────────────

  describe('objet campagne', () => {
    it('charge l’objet campagne et complète le nom quand aucune facture n’en porte un', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const getCampagne = vi
        .fn()
        .mockResolvedValue({ campagneId: 'camp-1', nom: 'Septembre 2026', envoyerWhatsappAuto: false });
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getCampagne });
      fixture.detectChanges();
      await flush();

      expect(fixture.componentInstance.campagne()?.nom).toBe('Septembre 2026');
      expect(fixture.componentInstance.campagneNom()).toBe('Septembre 2026');
    });
  });

  // ── Erreur de chargement de la page ────────────────────────────────────────

  describe('erreur de chargement', () => {
    it('affiche le message serveur quand getFactures échoue', async () => {
      const getFactures = vi.fn().mockRejectedValue(new Error('Campagne indisponible'));
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();

      expect(fixture.componentInstance.error()).toBe('Campagne indisponible');
      expect(fixture.componentInstance.loading()).toBe(false);
    });
  });

  // ── Génération manuelle des factures ───────────────────────────────────────

  describe('génération manuelle des factures', () => {
    it('génère, affiche un succès et recharge la page', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const genererFactures = vi.fn().mockResolvedValue({});
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), genererFactures });
      fixture.detectChanges();
      await flush();
      getFactures.mockClear();

      await fixture.componentInstance.genererFactures();

      expect(genererFactures).toHaveBeenCalledWith('camp-1', false);
      expect(getFactures).toHaveBeenCalled();
      expect(fixture.componentInstance.generatingFactures()).toBe(false);
      const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
      expect(toast.success).toHaveBeenCalled();
    });

    it('transmet envoyerWhatsappAuto de la campagne courante', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const genererFactures = vi.fn().mockResolvedValue({});
      const getCampagne = vi.fn().mockResolvedValue({ campagneId: 'camp-1', nom: 'x', envoyerWhatsappAuto: true });
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), genererFactures, getCampagne });
      fixture.detectChanges();
      await flush();

      await fixture.componentInstance.genererFactures();

      expect(genererFactures).toHaveBeenCalledWith('camp-1', true);
    });

    it('affiche l’erreur serveur en cas d’échec', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const genererFactures = vi.fn().mockRejectedValue(new Error('Génération refusée'));
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), genererFactures });
      fixture.detectChanges();
      await flush();

      await fixture.componentInstance.genererFactures();

      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
      expect(toast.error).toHaveBeenCalledWith('Génération refusée');
      expect(fixture.componentInstance.generatingFactures()).toBe(false);
    });

    it('ignore un second appel pendant que le premier est en vol', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const genererFactures = vi.fn().mockResolvedValue({});
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), genererFactures });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.generatingFactures.set(true);

      await fixture.componentInstance.genererFactures();

      expect(genererFactures).not.toHaveBeenCalled();
    });
  });

  // ── Envoi WhatsApp en masse (confirmation) ────────────────────────────────

  describe('envoi WhatsApp en masse', () => {
    it('n’ouvre pas la confirmation s’il n’y a personne à relancer', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts({ IMPAYEE: 0, PARTIELLE: 0 }) });
      fixture.detectChanges();
      await flush();

      fixture.componentInstance.ouvrirConfirmationWhatsapp();

      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(false);
    });

    it('ouvre la confirmation, envoie puis referme au succès', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn().mockResolvedValue({});
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 3 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();

      fixture.componentInstance.ouvrirConfirmationWhatsapp();
      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(true);

      await fixture.componentInstance.confirmerEnvoiWhatsapp();

      expect(envoyerToutesFacturesWhatsapp).toHaveBeenCalledWith('camp-1');
      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(false);
      expect(fixture.componentInstance.sendingWhatsapp()).toBe(false);
    });

    it('affiche l’erreur serveur et garde la confirmation ouverte en cas d’échec', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn().mockRejectedValue(new Error('Envoi refusé'));
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 3 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.ouvrirConfirmationWhatsapp();

      await fixture.componentInstance.confirmerEnvoiWhatsapp();

      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
      expect(toast.error).toHaveBeenCalledWith('Envoi refusé');
      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(true);
    });

    it('fermerConfirmationWhatsapp masque la sheet sans envoyer', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn();
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 1 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.ouvrirConfirmationWhatsapp();

      fixture.componentInstance.fermerConfirmationWhatsapp();

      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(false);
      expect(envoyerToutesFacturesWhatsapp).not.toHaveBeenCalled();
    });
  });

  // ── Soldes en erreur (chargement réel de la page) ─────────────────────────

  describe('soldes en erreur', () => {
    it('marque en erreur les soldes dont le chargement échoue', async () => {
      const f = facture({ factureId: 'f-err', statut: 'IMPAYEE' });
      const getFactures = vi.fn().mockResolvedValue([f]);
      const getSoldeFacture = vi.fn().mockRejectedValue(new Error('429'));
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getSoldeFacture });
      fixture.detectChanges();
      await flush();

      expect(fixture.componentInstance.soldeEnErreur(f)).toBe(true);
      expect(fixture.componentInstance.soldeFor(f)).toBeNull();
    });
  });

  // ── Sélecteur multi-campagnes ──────────────────────────────────────────────

  describe('onCampagneChange', () => {
    it('ne navigue que vers une campagne différente de la campagne courante', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };

      fixture.componentInstance.onCampagneChange('camp-1');
      expect(router.navigate).not.toHaveBeenCalled();

      fixture.componentInstance.onCampagneChange('camp-2');
      expect(router.navigate).toHaveBeenCalledWith(['/factures/campagne', 'camp-2']);
    });
  });

  // ── Panneau de paiement inline ─────────────────────────────────────────────

  describe('panneau de paiement inline', () => {
    it('openPanel / closePanel pilotent la facture sélectionnée', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      const f = facture({ factureId: 'f-1' });

      fixture.componentInstance.openPanel(f);
      expect(fixture.componentInstance.selectedFacture()?.factureId).toBe('f-1');

      fixture.componentInstance.closePanel();
      expect(fixture.componentInstance.selectedFacture()).toBeNull();
    });

    it('onPaiementSaved ferme le panneau si la facture est désormais soldée', async () => {
      const f = facture({ factureId: 'f-1', statut: 'PARTIELLE' });
      const getFactures = vi
        .fn()
        .mockResolvedValueOnce([f])
        .mockResolvedValue([{ ...f, statut: 'PAYEE' } as FactureLigne]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.openPanel(f);

      await fixture.componentInstance.onPaiementSaved();

      expect(fixture.componentInstance.selectedFacture()).toBeNull();
      const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
      expect(toast.success).toHaveBeenCalled();
    });

    it('onPaiementSaved garde le panneau ouvert avec la facture rafraîchie si elle reste partielle', async () => {
      const f = facture({ factureId: 'f-1', statut: 'PARTIELLE' });
      const rafraichie = { ...f, montant: 12_345 } as FactureLigne;
      const getFactures = vi.fn().mockResolvedValueOnce([f]).mockResolvedValue([rafraichie]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.openPanel(f);

      await fixture.componentInstance.onPaiementSaved();

      expect(fixture.componentInstance.selectedFacture()).toBe(rafraichie);
    });

    it('onPaiementSaved ne recherche pas de mise à jour si aucune facture n’était sélectionnée', async () => {
      const getFactures = vi.fn().mockResolvedValue([facture({ factureId: 'f-1' })]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();

      await expect(fixture.componentInstance.onPaiementSaved()).resolves.toBeUndefined();
      expect(fixture.componentInstance.selectedFacture()).toBeNull();
    });
  });

  // ── Rendu réel : le gabarit est effectivement exercé ──────────────────────

  describe('rendu réel : colonne solde et actions par statut', () => {
    it('affiche l’état de solde propre à chaque ligne et les actions liées au statut', async () => {
      const impayee = facture({ factureId: 'f-imp', abonneId: 'a-1', numeroFacture: 'F-IMP', statut: 'IMPAYEE' });
      const partielle = facture({
        factureId: 'f-part',
        abonneId: 'a-2',
        numeroFacture: 'F-PART',
        statut: 'PARTIELLE',
      });
      const payee = facture({ factureId: 'f-paid', abonneId: 'a-3', numeroFacture: 'F-PAID', statut: 'PAYEE' });
      const annulee = facture({ factureId: 'f-ann', abonneId: 'a-4', numeroFacture: 'F-ANN', statut: 'ANNULEE' });
      const getFactures = vi.fn().mockResolvedValue([impayee, partielle, payee, annulee]);
      const getSoldeFacture = vi.fn().mockImplementation((id: string) => {
        if (id === 'f-imp') return Promise.resolve({ soldeRestant: 20_000 });
        if (id === 'f-part') return Promise.reject(new Error('429'));
        return Promise.resolve({ soldeRestant: 0 });
      });
      const getDetteAbonne = vi.fn().mockImplementation((abonneId: string) =>
        Promise.resolve(
          abonneId === 'a-1'
            ? { totalDu: 23_000, nbFactures: 2, plusAncienneEcheance: '' }
            : { totalDu: 0, nbFactures: 0, plusAncienneEcheance: '' },
        ),
      );
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getSoldeFacture, getDetteAbonne });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.solde-red')).toBeTruthy(); // IMPAYEE
      expect(racine.querySelector('.solde-erreur')).toBeTruthy(); // PARTIELLE en échec de chargement
      expect(racine.querySelector('.solde-zero')).toBeTruthy(); // PAYEE
      // Ce que l'abonné doit ailleurs (23 000 dus au total − 20 000 sur cette ligne).
      expect(racine.querySelector('.solde-ailleurs')?.textContent).toContain('3');

      const labels = Array.from(racine.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label'));
      expect(labels).toContain('FACTURATION.ACTION_PDF'); // PAYEE seulement
      expect(labels).toContain('FACTURATION.ACTION_PAIEMENT'); // IMPAYEE/PARTIELLE

      const ligneAnnulee = Array.from(racine.querySelectorAll('tr')).find((tr) =>
        tr.textContent?.includes('F-ANN'),
      );
      expect(ligneAnnulee?.querySelector('.btn-action--primary')).toBeNull();
      expect(ligneAnnulee?.querySelector('.pi-file-pdf')).toBeNull();
    });

    it('clique sur Voir, PDF et Paiement : chaque bouton déclenche sa propre action', async () => {
      const payee = facture({ factureId: 'f-paid', abonneId: 'a-3', numeroFacture: 'F-PAID', statut: 'PAYEE' });
      const impayee = facture({ factureId: 'f-imp', abonneId: 'a-1', numeroFacture: 'F-IMP', statut: 'IMPAYEE' });
      const getFactures = vi.fn().mockResolvedValue([payee, impayee]);
      const pdfOpen = vi.fn().mockResolvedValue(undefined);
      const renvoyerFactureWhatsapp = vi.fn().mockResolvedValue({});
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts(),
        pdfOpen,
        renvoyerFactureWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };

      const racine = fixture.nativeElement as HTMLElement;
      (racine.querySelector('[aria-label="FACTURATION.ACTION_VOIR"]') as HTMLButtonElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-paid']);

      (racine.querySelector('[aria-label="FACTURATION.ACTION_PDF"]') as HTMLButtonElement).click();
      await flush();
      expect(pdfOpen).toHaveBeenCalledWith('f-paid');

      const boutonPaiement = racine.querySelector('[aria-label="FACTURATION.ACTION_PAIEMENT"]') as HTMLButtonElement;
      boutonPaiement.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedFacture()?.factureId).toBe('f-imp');

      const boutonWa = racine.querySelector('.btn-action--icon') as HTMLButtonElement;
      boutonWa.click();
      await flush();
      expect(renvoyerFactureWhatsapp).toHaveBeenCalledWith('f-imp');
    });
  });

  describe('rendu réel : carte mobile et colonne abonné (desktop)', () => {
    it('affiche le nom de l’abonné quand résolu, un numéro de repli sinon, et navigue au clic sur la carte', async () => {
      const avecNom = facture({ factureId: 'f-1', abonneId: 'a-1', numeroFacture: 'F-1', abonneNom: 'Dupont', abonneNumero: 'AB-01' });
      const sansNom = facture({ factureId: 'f-2', abonneId: 'a-2', numeroFacture: 'F-2' });
      const getFactures = vi.fn().mockResolvedValue([avecNom, sansNom]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;

      // Colonne desktop : nom + numéro quand résolu, repli sur le numéro sinon.
      expect(racine.querySelector('.abonne-nom:not(.abonne-nom--absent)')?.textContent).toContain('Dupont');
      expect(racine.querySelector('.abonne-nom--absent')).toBeTruthy();

      // Carte mobile (même donnée, gabarit différent).
      const cartes = Array.from(racine.querySelectorAll('.fcard'));
      expect(cartes.length).toBeGreaterThanOrEqual(2);
      expect(cartes[0].querySelector('.fcard__nom')?.textContent?.trim()).toBe('Dupont');

      const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
      (cartes[0] as HTMLButtonElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-1']);
    });
  });

  describe('rendu réel : bannière génération manuelle', () => {
    it('s’affiche pour une campagne vide en génération manuelle, et déclenche la génération au clic', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const genererFactures = vi.fn().mockResolvedValue({});
      const getCampagne = vi
        .fn()
        .mockResolvedValue({ campagneId: 'camp-1', nom: 'Sept 2026', genererFacturesAuto: false, envoyerWhatsappAuto: false });
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getCampagne, genererFactures });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.generate-banner')).toBeTruthy();

      (racine.querySelector('.btn-generer') as HTMLButtonElement).click();
      await flush();

      expect(genererFactures).toHaveBeenCalledWith('camp-1', false);
    });
  });

  describe('rendu réel : envoi WhatsApp en masse (topbar + sheet)', () => {
    it('ouvre la confirmation depuis le bouton topbar, puis confirme depuis la sheet', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn().mockResolvedValue({});
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 4 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      const boutonTopbar = racine.querySelector('.btn-whatsapp-tous') as HTMLButtonElement;
      expect(boutonTopbar).toBeTruthy();
      boutonTopbar.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(true);

      const boutonConfirmer = racine.querySelector('.wa-bulk-btn--confirm') as HTMLButtonElement;
      expect(boutonConfirmer).toBeTruthy();
      boutonConfirmer.click();
      await flush();
      fixture.detectChanges();

      expect(envoyerToutesFacturesWhatsapp).toHaveBeenCalledWith('camp-1');
      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(false);
    });

    it('ferme la sheet sans envoyer au clic sur Annuler', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn();
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 2 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.componentInstance.ouvrirConfirmationWhatsapp();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      (racine.querySelector('.wa-bulk-btn--ghost') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.componentInstance.whatsappConfirmVisible()).toBe(false);
      expect(envoyerToutesFacturesWhatsapp).not.toHaveBeenCalled();
    });
  });

  describe('rendu réel : spinners et bandeau d’erreur', () => {
    it('affiche le bandeau d’erreur et relance au clic sur Réessayer', async () => {
      const getFactures = vi
        .fn()
        .mockRejectedValueOnce(new Error('Campagne indisponible'))
        .mockResolvedValue([]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      const bouton = racine.querySelector('.error-banner__retry') as HTMLButtonElement;
      expect(bouton).toBeTruthy();
      getFactures.mockClear();
      bouton.click();
      await flush();

      expect(getFactures).toHaveBeenCalled();
    });

    it('affiche un spinner sur le bouton topbar pendant l’envoi WhatsApp en masse', async () => {
      let resoudreWa!: (v: unknown) => void;
      const enVolWa = new Promise((r) => (resoudreWa = r));
      const getFactures = vi.fn().mockResolvedValue([]);
      const envoyerToutesFacturesWhatsapp = vi.fn().mockReturnValue(enVolWa);
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts({ IMPAYEE: 2 }),
        envoyerToutesFacturesWhatsapp,
      });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      (racine.querySelector('.btn-whatsapp-tous') as HTMLButtonElement).click();
      fixture.detectChanges();
      (racine.querySelector('.wa-bulk-btn--confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(racine.querySelector('.btn-whatsapp-tous .pi-spinner')).toBeTruthy();

      resoudreWa({});
      await flush();
      fixture.detectChanges();
      expect(racine.querySelector('.btn-whatsapp-tous .pi-spinner')).toBeNull();
    });

    it('affiche un spinner sur le bouton de génération manuelle pendant l’appel', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const getCampagne = vi
        .fn()
        .mockResolvedValue({ campagneId: 'camp-1', nom: 'x', genererFacturesAuto: false, envoyerWhatsappAuto: false });
      let resoudreGen!: (v: unknown) => void;
      const enVolGen = new Promise((r) => (resoudreGen = r));
      const genererFactures = vi.fn().mockReturnValue(enVolGen);
      const fixture = creer({
        getFactures,
        getFacturesCount: defaultCounts(), // tout à 0 -> campagne vide -> bannière visible
        getCampagne,
        genererFactures,
      });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      (racine.querySelector('.btn-generer') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(racine.querySelector('.btn-generer .pi-spinner')).toBeTruthy();

      resoudreGen({});
      await flush();
      fixture.detectChanges();
      expect(racine.querySelector('.btn-generer .pi-spinner')).toBeNull();
    });
  });

  describe('rendu réel : solde en cours de chargement et solde bleu (partielle)', () => {
    it('affiche « — » tant que le solde n’est pas résolu, et en bleu pour une facture partielle réglée en partie', async () => {
      const partielle = facture({ factureId: 'f-part', abonneId: 'a-2', numeroFacture: 'F-PART', statut: 'PARTIELLE' });
      const getFactures = vi.fn().mockResolvedValue([partielle]);
      const getSoldeFacture = vi.fn().mockReturnValue(new Promise(() => undefined)); // jamais résolu
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getSoldeFacture });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.solde-loading')?.textContent).toContain('—');
    });

    it('affiche le solde en bleu pour une facture partielle avec un reste positif', async () => {
      const partielle = facture({ factureId: 'f-part', abonneId: 'a-2', numeroFacture: 'F-PART', statut: 'PARTIELLE' });
      const getFactures = vi.fn().mockResolvedValue([partielle]);
      const getSoldeFacture = vi.fn().mockResolvedValue({ soldeRestant: 4000 });
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), getSoldeFacture });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.solde-blue')).toBeTruthy();
    });
  });

  describe('sélecteur de campagnes (filtersConfig)', () => {
    it('propose les campagnes distinctes portées par les factures', async () => {
      const f = facture({
        factureId: 'f-1',
        abonneId: 'a-1',
        campagneId: 'camp-2',
        campagneNom: 'Octobre 2026',
        campagnePeriodeMois: 10,
        campagnePeriodeAnnee: 2026,
      } as Partial<FactureLigne>);
      const getFactures = vi.fn().mockResolvedValue([f]);
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts() });
      fixture.detectChanges();
      await flush();

      const chip = fixture.componentInstance.filtersConfig().find((c) => c.key === 'campagne');
      expect(chip?.options.some((o) => o.value === 'camp-2' && o.label === 'Octobre 2026')).toBe(true);
    });
  });

  describe('flux temps réel `factureUpdated`', () => {
    it('fusionne la mise à jour sur la ligne affichée et recharge son solde si elle devient PARTIELLE', async () => {
      const f = facture({ factureId: 'f-1', abonneId: 'a-1', numeroFacture: 'F-1', statut: 'IMPAYEE', montant: 10_000 });
      const getFactures = vi.fn().mockResolvedValue([f]);
      const evenements = new Subject<{ data: { factureUpdated: Partial<FactureLigne> | null } }>();
      TestBed.configureTestingModule({
        imports: [FacturesListComponent],
        providers: [
          provideTranslateService({}),
          {
            provide: FacturesService,
            useValue: {
              getFactures,
              getFacturesCount: defaultCounts(),
              getSoldeFacture: vi.fn().mockResolvedValue({ soldeRestant: 3000 }),
              getDetteAbonne: vi.fn().mockResolvedValue({ totalDu: 0, nbFactures: 0, plusAncienneEcheance: '' }),
            },
          },
          { provide: FacturePdfService, useValue: {} },
          { provide: CampagnesService, useValue: { getCampagne: vi.fn().mockRejectedValue(new Error('n/a')) } },
          { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
          { provide: Apollo, useValue: { subscribe: vi.fn().mockReturnValue(evenements) } },
          { provide: Router, useValue: { navigate: vi.fn() } },
          { provide: ActivatedRoute, useValue: { params: of({ campagneId: 'camp-1' }) } },
        ],
      });
      const fixture = TestBed.createComponent(FacturesListComponent);
      fixture.detectChanges();
      await flush();

      evenements.next({ data: { factureUpdated: { factureId: 'f-1', statut: 'PARTIELLE', montant: 10_000 } } });
      await flush();

      expect(fixture.componentInstance.factures()[0].statut).toBe('PARTIELLE');
      // Le solde a été rechargé pour la ligne désormais PARTIELLE.
      const facturesService = TestBed.inject(FacturesService) as unknown as {
        getSoldeFacture: ReturnType<typeof vi.fn>;
      };
      expect(facturesService.getSoldeFacture).toHaveBeenCalledWith('f-1');
    });
  });

  describe('erreurs remontées à l’écran (envoi WhatsApp / PDF depuis une ligne)', () => {
    it('envoyerWhatsapp affiche l’erreur serveur', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const renvoyerFactureWhatsapp = vi.fn().mockRejectedValue(new Error('Envoi refusé'));
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), renvoyerFactureWhatsapp });
      fixture.detectChanges();
      await flush();
      const event = { stopPropagation: vi.fn() } as unknown as Event;

      await fixture.componentInstance.envoyerWhatsapp('f-1', event);

      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
      expect(toast.error).toHaveBeenCalledWith('Envoi refusé');
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('openPdf affiche une erreur dédiée en cas d’échec', async () => {
      const getFactures = vi.fn().mockResolvedValue([]);
      const pdfOpen = vi.fn().mockRejectedValue(new Error('503'));
      const fixture = creer({ getFactures, getFacturesCount: defaultCounts(), pdfOpen });
      fixture.detectChanges();
      await flush();
      const event = { stopPropagation: vi.fn() } as unknown as Event;

      await fixture.componentInstance.openPdf('f-1', event);

      const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
      expect(toast.error).toHaveBeenCalledWith('FACTURATION.DETAIL.PDF_ERROR');
    });
  });
});

describe('FacturesListComponent — colonnes triables et filtres (logique pure)', () => {
  function creer() {
    TestBed.configureTestingModule({
      imports: [FacturesListComponent],
      providers: [
        provideTranslateService({}),
        {
          provide: FacturesService,
          useValue: { getSoldeFacture: vi.fn(), getDetteAbonne: vi.fn(), getFactures: vi.fn().mockResolvedValue([]) },
        },
        { provide: FacturePdfService, useValue: {} },
        { provide: CampagnesService, useValue: { list: vi.fn().mockResolvedValue([]) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: { subscribe: () => of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(new Map()), snapshot: { paramMap: new Map() } },
        },
      ],
    });
    // Pas de detectChanges : `ngOnInit` déclencherait les chargements réseau.
    return TestBed.createComponent(FacturesListComponent).componentInstance;
  }

  it('chaque colonne triable extrait la bonne valeur de tri', () => {
    const c = creer();
    c.abonnesMap.set(new Map([['a-1', { nom: 'Dupont', prenom: 'Jean', numeroAbonne: 'AB-01' }]]));
    c.soldes.set(new Map([['f-1', 7000]]));
    const f = facture({ factureId: 'f-1', abonneId: 'a-1', numeroFacture: 'FACT-01', montant: 9000, statut: 'PARTIELLE' });

    const col = (key: string) => c.columns.find((col) => col.key === key)!;
    expect(col('numero').sortValue!(f)).toBe('FACT-01');
    expect(col('abonne').sortValue!(f)).toBe('Dupont');
    expect(col('montant').sortValue!(f)).toBe(9000);
    expect(col('solde').sortValue!(f)).toBe(7000);
    expect(col('statut').sortValue!(f)).toBe('PARTIELLE');
  });

  it('la colonne solde retombe sur 0 quand rien n’est encore chargé', () => {
    const c = creer();
    const f = facture({ factureId: 'f-2' });
    expect(c.columns.find((col) => col.key === 'solde')!.sortValue!(f)).toBe(0);
  });

  it('campagneVide : fausse dès qu’il y a des factures sur la page', () => {
    const c = creer();
    c.factures.set([facture()]);
    expect(c.campagneVide()).toBe(false);
  });

  it('campagneVide en mode serveur : vaut vrai seulement si le total de la campagne est nul', () => {
    const c = creer();
    c.factures.set([]);
    c.searchTerm.set('');
    c.countsParStatut.set({ IMPAYEE: 0, PARTIELLE: 0, PAYEE: 0, ANNULEE: 0 });
    expect(c.campagneVide()).toBe(true);

    c.countsParStatut.set({ IMPAYEE: 1, PARTIELLE: 0, PAYEE: 0, ANNULEE: 0 });
    expect(c.campagneVide()).toBe(false); // page vide, mais la campagne ne l'est pas
  });

  it('campagneVide en mode recherche (client) : une page vide suffit', () => {
    const c = creer();
    c.factures.set([]);
    c.searchTerm.set('dupont');
    expect(c.campagneVide()).toBe(true);
  });

  it('facturesFiltrees combine statut et recherche (numéro ou nom d’abonné)', () => {
    const c = creer();
    c.abonnesMap.set(
      new Map([
        ['a-1', { nom: 'Dupont', prenom: 'Jean', numeroAbonne: 'AB-01' }],
        ['a-2', { nom: 'Ateba', prenom: 'Awa', numeroAbonne: 'AB-02' }],
      ]),
    );
    c.factures.set([
      facture({ factureId: 'f-1', abonneId: 'a-1', numeroFacture: 'FACT-01', statut: 'IMPAYEE' }),
      facture({ factureId: 'f-2', abonneId: 'a-2', numeroFacture: 'FACT-02', statut: 'PAYEE' }),
    ]);
    c.filtreStatut.set('IMPAYEE');
    expect(c.facturesFiltrees().map((f) => f.factureId)).toEqual(['f-1']);

    c.filtreStatut.set('TOUS');
    c.searchTerm.set('dupont');
    expect(c.facturesFiltrees().map((f) => f.factureId)).toEqual(['f-1']);

    c.searchTerm.set('fact-02');
    expect(c.facturesFiltrees().map((f) => f.factureId)).toEqual(['f-2']);
  });

  it('onFiltersChange navigue vers la nouvelle campagne quand elle change', () => {
    const c = creer();
    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };

    c.onFiltersChange({ campagne: 'camp-2', statut: null });

    expect(router.navigate).toHaveBeenCalledWith(['/factures/campagne', 'camp-2']);
  });

  it('onFiltersChange répercute un changement de statut sans naviguer', () => {
    const c = creer();
    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };

    c.onFiltersChange({ campagne: null, statut: 'IMPAYEE' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(c.filtreStatut()).toBe('IMPAYEE');
  });
});

describe('FacturesListComponent — redirection sans campagne dans l’URL', () => {
  async function flush(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }

  function creer(getFactures: ReturnType<typeof vi.fn>, router = { navigate: vi.fn() }) {
    TestBed.configureTestingModule({
      imports: [FacturesListComponent],
      providers: [
        provideTranslateService({}),
        {
          provide: FacturesService,
          useValue: { getFactures, getSoldeFacture: vi.fn(), getDetteAbonne: vi.fn(), getFacturesCount: vi.fn() },
        },
        { provide: FacturePdfService, useValue: {} },
        { provide: CampagnesService, useValue: { getCampagne: vi.fn().mockRejectedValue(new Error('n/a')) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: { subscribe: () => of({}) } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { params: of({}) } },
      ],
    });
    return { fixture: TestBed.createComponent(FacturesListComponent), router };
  }

  it('redirige vers la campagne la plus récente dérivée des factures', async () => {
    const ancienne = ligneAvecCampagne({
      factureId: 'f-1',
      abonneId: 'a-1',
      campagneId: 'c-old',
      campagneNom: 'Juillet 2026',
      campagnePeriodeMois: 7,
      campagnePeriodeAnnee: 2026,
    });
    const recente = ligneAvecCampagne({
      factureId: 'f-2',
      abonneId: 'a-2',
      campagneId: 'c-new',
      campagneNom: 'Août 2026',
      campagnePeriodeMois: 8,
      campagnePeriodeAnnee: 2026,
    });
    const getFactures = vi.fn().mockResolvedValue([ancienne, recente]);
    const { fixture, router } = creer(getFactures);

    fixture.detectChanges();
    await flush();

    expect(router.navigate).toHaveBeenCalledWith(['/factures/campagne', 'c-new'], { replaceUrl: true });
  });

  it('arrête le chargement sans naviguer si aucune campagne n’est trouvée', async () => {
    const getFactures = vi.fn().mockResolvedValue([]);
    const { fixture, router } = creer(getFactures);

    fixture.detectChanges();
    await flush();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('arrête le chargement si la résolution des campagnes échoue', async () => {
    const getFactures = vi.fn().mockRejectedValue(new Error('boom'));
    const { fixture, router } = creer(getFactures);

    fixture.detectChanges();
    await flush();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
