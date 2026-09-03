import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { FacturesListComponent } from './factures-list.component';
import { FacturesService } from '../../../core/factures/factures.service';
import { FacturePdfService } from '../../../core/factures/facture-pdf.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../shared/services/toast.service';
import { DetteAbonne } from '../../../shared/models/facture.model';
import type { FactureLigne } from '../../../graphql/vues';

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
            getSoldeFacture: vi.fn().mockResolvedValue({ soldeRestant: 0 }),
            getDetteAbonne: vi.fn().mockResolvedValue({ totalDu: 0, nbFactures: 0, plusAncienneEcheance: '' }),
          },
        },
        { provide: FacturePdfService, useValue: {} },
        { provide: CampagnesService, useValue: { getCampagne: vi.fn().mockRejectedValue(new Error('n/a')) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Apollo, useValue: { subscribe: () => of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { campagneId: 'camp-1' } } },
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
});
