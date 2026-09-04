import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { RapportsListComponent } from './rapports-list.component';
import { ExportsService } from '../../core/rapports/exports.service';
import { CampagnesService } from '../../core/campagnes/campagnes.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Écran Rapports : agrégats globaux + quatre exports serveur (factures et
 * paiements par campagne OU par période, synthèse PDF, bilan des impayés).
 * Ces tests portent sur les deux critères d'export mutuellement exclusifs,
 * sur le refus d'une période inversée, et sur la désambiguïsation des
 * campagnes homonymes venues d'un service Reporting qui tient sa propre copie.
 */
function stats(over: Partial<{ montantTotalFactureGlobal: number; montantTotalEncaisseGlobal: number; historiqueCampagnes: Array<{ campagneId: string; nomCampagne: string }> }> = {}) {
  return {
    consommationTotaleGlobale: 1000,
    montantTotalFactureGlobal: 100_000,
    montantTotalEncaisseGlobal: 60_000,
    historiqueCampagnes: [
      { campagneId: 'c-1', nomCampagne: 'Août 2026', totalAbonnes: 10, nbReleves: 8, pourcentageProgression: 80, consommationTotale: 500 },
    ],
    ...over,
  };
}

function monter(over: {
  query?: ReturnType<typeof vi.fn>;
  getCampagnes?: ReturnType<typeof vi.fn>;
  facturesCsv?: ReturnType<typeof vi.fn>;
  paiementsCsv?: ReturnType<typeof vi.fn>;
  synthesePdf?: ReturnType<typeof vi.fn>;
  bilanImpayesPdf?: ReturnType<typeof vi.fn>;
} = {}) {
  const query = over.query ?? vi.fn().mockReturnValue(of({ data: { statsGlobales: stats() } }));
  const getCampagnes = over.getCampagnes ?? vi.fn().mockResolvedValue([]);
  const facturesCsv = over.facturesCsv ?? vi.fn().mockResolvedValue(undefined);
  const paiementsCsv = over.paiementsCsv ?? vi.fn().mockResolvedValue(undefined);
  const synthesePdf = over.synthesePdf ?? vi.fn().mockResolvedValue(undefined);
  const bilanImpayesPdf = over.bilanImpayesPdf ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [RapportsListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: Apollo, useValue: { query, subscribe: () => of({}) } },
      { provide: CampagnesService, useValue: { getCampagnes } },
      { provide: ExportsService, useValue: { facturesCsv, paiementsCsv, synthesePdf, bilanImpayesPdf } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RapportsListComponent);
  return { fixture, c: fixture.componentInstance, facturesCsv, paiementsCsv, synthesePdf, bilanImpayesPdf };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('RapportsListComponent — chargement', () => {
  it('charge les statistiques globales et présélectionne la campagne la plus récente', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.selectedCampagneId()).toBe('c-1');
    expect(c.loading()).toBe(false);
  });

  it('calcule le taux de recouvrement', async () => {
    const { fixture, c } = monter({
      query: vi.fn().mockReturnValue(of({ data: { statsGlobales: stats({ montantTotalFactureGlobal: 200_000, montantTotalEncaisseGlobal: 150_000 }) } })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.tauxRecouvrement()).toBe(75);
  });

  it('le taux de recouvrement est nul sans facturation', async () => {
    const { fixture, c } = monter({
      query: vi.fn().mockReturnValue(of({ data: { statsGlobales: stats({ montantTotalFactureGlobal: 0 }) } })),
    });
    fixture.detectChanges();
    await flush();
    expect(c.tauxRecouvrement()).toBe(0);
  });

  it('affiche une erreur si le chargement échoue', async () => {
    const { fixture, c } = monter({ query: vi.fn().mockReturnValue(throwError(() => new Error('panne'))) });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBeTruthy();
  });
});

describe('RapportsListComponent — critères d’export', () => {
  it('en mode campagne : prêt seulement si une campagne est choisie', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.csvPret()).toBe(true); // présélectionnée au chargement
    c.selectedCampagneId.set(null);
    expect(c.csvPret()).toBe(false);
  });

  it('en mode période : refuse une borne de fin antérieure au début', () => {
    const { c } = monter();
    c.modeExport.set('periode');
    c.dateDebut.set(new Date('2026-08-10'));
    c.dateFin.set(new Date('2026-08-01'));
    expect(c.periodeInvalide()).toBe(true);
    expect(c.csvPret()).toBe(false);
  });

  it('en mode période : aucune borne est un critère valide (clôture d’exercice)', () => {
    const { c } = monter();
    c.modeExport.set('periode');
    expect(c.periodeInvalide()).toBe(false);
    expect(c.csvPret()).toBe(true);
  });

  it('les critères transmis correspondent exactement au mode choisi', () => {
    const { c } = monter();
    c.selectedCampagneId.set('c-9');
    expect(c.criteresExport()).toEqual({ campagneId: 'c-9' });

    c.modeExport.set('periode');
    c.dateDebut.set(new Date(2026, 7, 1));
    c.dateFin.set(new Date(2026, 7, 31));
    expect(c.criteresExport()).toEqual({ dateDebut: '2026-08-01', dateFin: '2026-08-31' });
  });
});

describe('RapportsListComponent — exports', () => {
  it('exportFactures transmet les critères exacts au service', async () => {
    const { c, facturesCsv } = monter();
    c.selectedCampagneId.set('c-1');
    c.exportFactures();
    await flush();
    expect(facturesCsv).toHaveBeenCalledWith({ campagneId: 'c-1' });
  });

  it('exportFactures ne fait rien si les critères ne sont pas prêts', async () => {
    const { c, facturesCsv } = monter();
    c.selectedCampagneId.set(null);
    c.exportFactures();
    await flush();
    expect(facturesCsv).not.toHaveBeenCalled();
  });

  it('exportPaiements transmet la période choisie', async () => {
    const { c, paiementsCsv } = monter();
    c.modeExport.set('periode');
    c.dateDebut.set(new Date(2026, 0, 1));
    c.exportPaiements();
    await flush();
    expect(paiementsCsv).toHaveBeenCalledWith({ dateDebut: '2026-01-01', dateFin: '' });
  });

  it('exportSynthese cible la campagne sélectionnée', async () => {
    const { c, synthesePdf } = monter();
    c.selectedCampagneId.set('c-5');
    c.exportSynthese();
    await flush();
    expect(synthesePdf).toHaveBeenCalledWith('c-5');
  });

  it('exportBilan est indépendant de toute campagne', async () => {
    const { c, bilanImpayesPdf } = monter();
    c.exportBilan();
    await flush();
    expect(bilanImpayesPdf).toHaveBeenCalledTimes(1);
  });

  it('n’autorise qu’un export à la fois', async () => {
    let resolve!: () => void;
    const enVol = new Promise<void>((r) => (resolve = r));
    const facturesCsv = vi.fn().mockReturnValue(enVol);
    const { c } = monter({ facturesCsv });
    c.selectedCampagneId.set('c-1');

    c.exportFactures();
    c.exportPaiements(); // doit être un no-op : un export est déjà en cours
    resolve();
    await flush();

    expect(facturesCsv).toHaveBeenCalledTimes(1);
  });

  it('affiche l’erreur serveur si l’export échoue', async () => {
    const { c } = monter({ facturesCsv: vi.fn().mockRejectedValue(new Error('Export impossible')) });
    c.selectedCampagneId.set('c-1');
    c.exportFactures();
    await flush();
    expect(c.exporting()).toBeNull();
  });
});

describe('RapportsListComponent — désambiguïsation des campagnes homonymes', () => {
  it('ne suffixe pas un nom unique', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.campagneOptions()[0].label).toBe('Août 2026');
  });

  it('suffixe deux campagnes homonymes par leur date de création', async () => {
    const { fixture, c } = monter({
      query: vi.fn().mockReturnValue(
        of({
          data: {
            statsGlobales: stats({
              historiqueCampagnes: [
                { campagneId: 'c-1', nomCampagne: 'Août 2026' } as never,
                { campagneId: 'c-2', nomCampagne: 'Août 2026' } as never,
              ],
            }),
          },
        }),
      ),
      getCampagnes: vi.fn().mockResolvedValue([
        { campagneId: 'c-1', dateCreation: '2026-08-01' },
        { campagneId: 'c-2', dateCreation: '2026-08-15' },
      ]),
    });
    fixture.detectChanges();
    await flush();

    const labels = c.campagneOptions().map((o) => o.label);
    expect(labels[0]).toContain('créée le');
    expect(labels[0]).not.toBe(labels[1]);
  });
});
