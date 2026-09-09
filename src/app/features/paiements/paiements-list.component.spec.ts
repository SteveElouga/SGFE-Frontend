import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { Subject, of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { PaiementsListComponent } from './paiements-list.component';
import { FacturesService } from '../../core/factures/factures.service';
import { ToastService } from '../../shared/services/toast.service';
import type { GetAllPaiementsQuery } from '../../graphql/generated';

/**
 * Journal de caisse : liste des paiements enrichis par facture (abonné,
 * campagne, statut), avec le total encaissé qui doit EXCLURE les paiements
 * annulés (PRODUCT.md « Exactitude financière visible »), et la mise à jour
 * en direct d'un encaissement créé ailleurs pendant que l'écran est ouvert.
 */
type Paiement = GetAllPaiementsQuery['paiements'][number];

function paiement(p: Partial<Paiement> = {}): Paiement {
  return {
    paiementId: 'p-1',
    factureId: 'f-1',
    montant: 5000,
    datePaiement: '2026-08-01',
    modePaiement: 'ESPECES',
    referenceTransaction: '',
    createdAt: '2026-08-01',
    annule: false,
    annuleLe: '',
    annulePar: '',
    motifAnnulation: '',
    ...p,
  } as Paiement;
}

function facture(p: Partial<{ factureId: string; numeroFacture: string; abonneId: string; abonneNom: string; abonneNumero: string; campagneId: string; campagneNom: string; campagnePeriodeMois: number; campagnePeriodeAnnee: number; statut: string }> = {}) {
  return {
    factureId: 'f-1',
    numeroFacture: 'FACT-1',
    abonneId: 'ab-1',
    abonneNom: 'Jean Dupont',
    abonneNumero: 'AB-0001',
    campagneId: 'camp-1',
    campagneNom: 'Août 2026',
    campagnePeriodeMois: 8,
    campagnePeriodeAnnee: 2026,
    statut: 'PARTIELLE',
    ...p,
  };
}

function monter(over: {
  getAllPaiements?: ReturnType<typeof vi.fn>;
  getFactures?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
  const getAllPaiements = over.getAllPaiements ?? vi.fn().mockResolvedValue([]);
  const getFactures = over.getFactures ?? vi.fn().mockResolvedValue([]);
  const subscribe = over.subscribe ?? vi.fn().mockReturnValue(of({ data: {} }));

  TestBed.configureTestingModule({
    imports: [PaiementsListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: FacturesService, useValue: { getAllPaiements, getFactures } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Apollo, useValue: { subscribe, query: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PaiementsListComponent);
  return { fixture, c: fixture.componentInstance };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('PaiementsListComponent — chargement', () => {
  it('résout abonné, numéro de facture et campagne depuis les libellés enrichis', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();

    const row = c.rows()[0];
    expect(row.abonneNom).toBe('Jean Dupont');
    expect(row.numeroFacture).toBe('FACT-1');
    expect(row.statutFacture).toBe('PARTIELLE');
    // La campagne du seul paiement présent est présélectionnée.
    expect(c.selectedCampagneId()).toBe('camp-1');
  });

  it('reste consultable si les factures ne chargent pas', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockRejectedValue(new Error('indisponible')),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeNull();
    expect(c.rows()).toHaveLength(1);
    expect(c.rows()[0].numeroFacture).toBe('—');
  });

  it('affiche l’erreur serveur si les paiements eux-mêmes échouent', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Service indisponible' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Service indisponible');
  });
});

describe('PaiementsListComponent — total encaissé exclut les annulés', () => {
  it('un paiement annulé ne compte ni dans le total ni ailleurs que dans son propre compteur', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', montant: 5000, annule: false }),
        paiement({ paiementId: 'p-2', montant: 2000, annule: true }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null); // pas de filtre campagne : les deux lignes comptent

    expect(c.totalMontant()).toBe(5000);
    expect(c.nbAnnules()).toBe(1);
    expect(c.montantAnnule()).toBe(2000);
  });
});

describe('PaiementsListComponent — filtres', () => {
  function creer() {
    return monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', modePaiement: 'ESPECES', datePaiement: '2026-08-01' }),
        paiement({ paiementId: 'p-2', factureId: 'f-2', modePaiement: 'MOBILE_MONEY', datePaiement: '2026-08-15' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([
        facture({ factureId: 'f-1', campagneId: 'camp-1' }),
        facture({ factureId: 'f-2', campagneId: 'camp-2', campagneNom: 'Septembre 2026', campagnePeriodeMois: 9 }),
      ]),
    });
  }

  it('filtre par campagne', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange('camp-2');
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('filtre par mode de paiement', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onModeChange('MOBILE_MONEY');
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('filtre par plage de dates', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onDateRangeChange([new Date('2026-08-10'), new Date('2026-08-31')]);
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);
  });

  it('recherche par nom d’abonné', async () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    c.onSearchChange('dupont');
    expect(c.rows()).toHaveLength(2); // les deux factures portent « Jean Dupont »
  });
});

describe('PaiementsListComponent — paiement créé en direct', () => {
  it('insère un nouveau paiement en tête du journal', async () => {
    const evenements = new Subject<{ data: { paiementCree: Partial<Paiement> } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    evenements.next({
      data: {
        paiementCree: {
          paiementId: 'p-live',
          factureId: 'f-9',
          montant: 1000,
          datePaiement: '2026-08-20',
          modePaiement: 'ESPECES',
          referenceTransaction: '',
        },
      },
    });

    expect(c.paiements()[0].paiementId).toBe('p-live');
    expect(c.paiements()[0].annule).toBe(false);
  });

  it('ignore un doublon (même paiementId déjà présent)', async () => {
    const evenements = new Subject<{ data: { paiementCree: Partial<Paiement> } }>();
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement({ paiementId: 'p-1' })]),
      subscribe: vi.fn().mockReturnValue(evenements),
    });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { paiementCree: { paiementId: 'p-1', factureId: 'f-1', montant: 5000, datePaiement: '2026-08-01', modePaiement: 'ESPECES', referenceTransaction: '' } } });

    expect(c.paiements()).toHaveLength(1);
  });
});

describe('PaiementsListComponent — libellés de statut', () => {
  it('statutLabel affiche « — » sans statut connu', async () => {
    const { c } = monter();
    expect(c.statutLabel({ statutFacture: null } as never)).toBe('—');
  });

  it('statutLabel traduit PAYEE et PARTIELLE via leurs clés dédiées', async () => {
    const { c } = monter();
    expect(c.statutLabel({ statutFacture: 'PAYEE' } as never)).toBe('PAIEMENTS.STATUT_SOLDE');
    expect(c.statutLabel({ statutFacture: 'PARTIELLE' } as never)).toBe('PAIEMENTS.STATUT_PARTIEL');
  });

  it('statutLabel retombe sur la clé générique du statut brut pour les autres valeurs', async () => {
    const { c } = monter();
    expect(c.statutLabel({ statutFacture: 'IMPAYEE' } as never)).toBe('FACTURATION.STATUT.IMPAYEE');
  });

  it('statutTone associe warning à une facture partielle', async () => {
    const { c } = monter();
    expect(c.statutTone({ statutFacture: 'PARTIELLE' } as never)).toBe('warning');
    expect(c.statutTone({ statutFacture: 'PAYEE' } as never)).toBe('success');
    expect(c.statutTone({ statutFacture: 'IMPAYEE' } as never)).toBe('neutral');
  });
});

describe('PaiementsListComponent — mise en forme', () => {
  it('formatDate rend une date au format jour/mois/année, et « — » sans date', async () => {
    const { c } = monter();
    expect(c.formatDate('2026-08-05')).toBe('05/08/2026');
    expect(c.formatDate('')).toBe('—');
  });

  it('formatPeriode capitalise le mois de la campagne', async () => {
    const { c } = monter();
    const periode = c.formatPeriode({ campagneId: 'c1', nom: '', periodeMois: 8, periodeAnnee: 2026, statut: '' });
    expect(periode).toBe('Août 2026');
  });

  it('subtitle reprend la période de la campagne sélectionnée, vide sans sélection', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockResolvedValue([facture({ campagneId: 'camp-1', campagnePeriodeMois: 8, campagnePeriodeAnnee: 2026 })]),
    });
    fixture.detectChanges();
    await flush();
    expect(c.subtitle()).toBe('Août 2026');

    c.onCampagneChange(null);
    expect(c.subtitle()).toBe('');
  });
});

describe('PaiementsListComponent — sécurité des requêtes par rôle', () => {
  it('ne passe jamais par Apollo directement : tout vient des deux requêtes autorisées au COMPTABLE', async () => {
    // `abonnes` et `campagnes` sont réservées à d'autres rôles (voir le
    // commentaire de `load()`) : ce composant ne doit dériver ses données que
    // de `getAllPaiements`/`getFactures`, jamais d'un appel Apollo direct qui
    // court-circuiterait ce choix et referait planter l'écran pour COMPTABLE
    // (même classe de bogue que celui déjà corrigé sur `/impayes`).
    const { fixture } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();
    const apollo = TestBed.inject(Apollo) as unknown as { query: ReturnType<typeof vi.fn> };
    expect(apollo.query).not.toHaveBeenCalled();
  });
});

describe('PaiementsListComponent — export CSV', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('avertit sans exporter si la vue filtrée est vide', () => {
    const { c } = monter();
    const toast = TestBed.inject(ToastService) as unknown as { info: ReturnType<typeof vi.fn> };
    c.exportCSV();
    expect(toast.info).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('exporte un CSV quand des lignes existent', async () => {
    const { fixture, c } = monter({ getAllPaiements: vi.fn().mockResolvedValue([paiement()]) });
    fixture.detectChanges();
    await flush();
    c.exportCSV();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('clique sur le bouton d’export du bandeau', async () => {
    const { fixture } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement()]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.btn-export') as HTMLButtonElement).click();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

/**
 * Rendu réel du template : les tests ci-dessus exercent `rows()` via les
 * signaux, mais aucun ne rappelle `detectChanges()` après la résolution du
 * chargement — le tableau, ses cellules riches (montant partiel/annulé,
 * référence manquante, badge de statut) et la carte mobile ne s'affichaient
 * donc jamais réellement.
 */
describe('PaiementsListComponent — rendu du template', () => {
  function creerTroisLignes() {
    return monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', modePaiement: 'ESPECES', referenceTransaction: '', annule: false }),
        paiement({ paiementId: 'p-2', factureId: 'f-1', modePaiement: 'MOBILE_MONEY', referenceTransaction: 'TX-42', annule: false }),
        paiement({
          paiementId: 'p-3', factureId: 'f-1', modePaiement: 'VIREMENT', referenceTransaction: '',
          annule: true, motifAnnulation: 'Erreur de saisie',
        }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture({ factureId: 'f-1', statut: 'PARTIELLE' })]),
    });
  }

  it('affiche le bandeau d’erreur avec bouton « réessayer »', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new CombinedGraphQLErrors({ data: null }, [{ message: 'Panne' }]))
      .mockResolvedValue([]);
    const { fixture } = monter({ getAllPaiements: load });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.error-banner__message')?.textContent).toContain('Panne');
    (racine.querySelector('.error-banner__retry') as HTMLButtonElement).click();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('affiche la mention « hors annulés » seulement s’il y a des annulations', async () => {
    const { fixture } = creerTroisLignes();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.total-kpi__annule')?.textContent).toContain('PAIEMENTS.TOTAL_HORS_ANNULES');
  });

  it('masque la mention « hors annulés » sans annulation', async () => {
    const { fixture } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([paiement({ annule: false })]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.total-kpi__annule')).toBeNull();
  });

  it('rend chaque cellule du tableau selon l’état du paiement', async () => {
    const { fixture } = creerTroisLignes();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const lignesTable = [...racine.querySelectorAll('tbody tr.dt__row')];
    expect(lignesTable).toHaveLength(3);

    // ESPECES sans référence : tiret discret, pas de mention « manquante ».
    expect(racine.querySelector('.col-reference--none')).toBeTruthy();
    // MOBILE_MONEY avec référence : affichée telle quelle.
    const references = [...racine.querySelectorAll('.col-reference')].map((e) => e.textContent);
    expect(references.some((t) => t?.includes('TX-42'))).toBe(true);
    // VIREMENT sans référence : signalée manquante.
    expect(racine.querySelector('.col-reference--missing')).toBeTruthy();

    // Ligne annulée : montant barré/marqué + tag « Annulé » avec son motif en titre.
    expect(racine.querySelector('.montant--annule')).toBeTruthy();
    const tagAnnule = racine.querySelector('.annule-tag');
    expect(tagAnnule).toBeTruthy();
    expect(tagAnnule?.getAttribute('title')).toBe('Erreur de saisie');

    // Ligne PARTIELLE non annulée : montant marqué partiel.
    expect(racine.querySelector('.montant--partiel')).toBeTruthy();

    // Badge de statut rendu pour chaque ligne.
    expect(racine.querySelectorAll('app-badge').length).toBeGreaterThanOrEqual(3);
  });

  it('rend aussi les cartes mobiles avec les mêmes états', async () => {
    const { fixture } = creerTroisLignes();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartes = [...racine.querySelectorAll('.pcard')];
    expect(cartes).toHaveLength(3);
    expect(racine.querySelector('.pcard__reference--missing')).toBeTruthy();
  });

  it('clique sur une ligne du tableau : navigue vers la facture correspondante', async () => {
    const { fixture } = creerTroisLignes();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('tbody tr.dt__row') as HTMLElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-1']);
  });

  it('clique sur une carte mobile : navigue aussi vers la facture', async () => {
    const { fixture } = creerTroisLignes();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.pcard') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/factures', 'f-1']);
  });

  it('trie la table par montant au clic sur l’en-tête de colonne', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', montant: 1000, datePaiement: '2026-08-01' }),
        paiement({ paiementId: 'p-2', factureId: 'f-1', montant: 9000, datePaiement: '2026-08-02' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture({ factureId: 'f-1' })]),
    });
    fixture.detectChanges();
    await flush();
    c.onCampagneChange(null);
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutons = [...racine.querySelectorAll<HTMLButtonElement>('.dt__sort-btn')];
    // Colonnes : date, abonné, facture, montant, mode, référence, statut.
    const boutonMontant = boutons[3];
    boutonMontant.click();
    fixture.detectChanges();
    const premiereLigneMontant = racine.querySelector('tbody tr.dt__row .col-montant')?.textContent ?? '';
    expect(premiereLigneMontant).toContain('1');
  });

  it('onFiltersChange répercute campagne et mode reçus du panneau de filtres', async () => {
    const { fixture, c } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', modePaiement: 'ESPECES' }),
        paiement({ paiementId: 'p-2', factureId: 'f-2', modePaiement: 'MOBILE_MONEY' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([
        facture({ factureId: 'f-1', campagneId: 'camp-1' }),
        facture({ factureId: 'f-2', campagneId: 'camp-2', campagneNom: 'Septembre 2026', campagnePeriodeMois: 9 }),
      ]),
    });
    fixture.detectChanges();
    await flush();

    c.onFiltersChange({ campagne: 'camp-2', mode: 'MOBILE_MONEY' });
    expect(c.selectedCampagneId()).toBe('camp-2');
    expect(c.filtreMode()).toBe('MOBILE_MONEY');
    expect(c.rows().map((r) => r.paiementId)).toEqual(['p-2']);

    c.onFiltersChange({ campagne: null, mode: null });
    expect(c.selectedCampagneId()).toBeNull();
    expect(c.filtreMode()).toBe('TOUS');
  });

  it('tape dans le champ de recherche du panneau de filtres : filtre réellement le tableau après le délai', async () => {
    const { fixture } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1' }),
        paiement({ paiementId: 'p-2', factureId: 'f-2' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([
        facture({ factureId: 'f-1', abonneNom: 'Jean Dupont' }),
        facture({ factureId: 'f-2', abonneNom: 'Awa Ndiaye' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champ = racine.querySelector('input[type="text"]') as HTMLInputElement;
    expect(champ).toBeTruthy();
    champ.value = 'ndiaye';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 300)); // debounceMs=250
    fixture.detectChanges();

    expect(racine.querySelectorAll('tbody tr.dt__row')).toHaveLength(1);
    expect(racine.querySelector('.abonne-nom')?.textContent).toContain('Awa Ndiaye');
  });

  it('clique sur une puce de filtre par mode de paiement : filtre réellement le tableau', async () => {
    const { fixture } = monter({
      getAllPaiements: vi.fn().mockResolvedValue([
        paiement({ paiementId: 'p-1', factureId: 'f-1', modePaiement: 'ESPECES' }),
        paiement({ paiementId: 'p-2', factureId: 'f-1', modePaiement: 'MOBILE_MONEY' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture({ factureId: 'f-1' })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const puces = [...racine.querySelectorAll<HTMLButtonElement>('.fp__chip')];
    const puceEspeces = puces.find((b) => b.textContent?.includes('FACTURATION.MODE.ESPECES'));
    expect(puceEspeces).toBeTruthy();
    puceEspeces!.click();
    fixture.detectChanges();

    expect(racine.querySelectorAll('tbody tr.dt__row')).toHaveLength(1);
  });
});
