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

/**
 * Rendu réel de l'écran : le spec existant appelait `detectChanges()` avant
 * `flush()` (squelette de chargement) mais jamais après — le contenu chargé
 * (KPI, barre d'export, tableau d'historique) n'était donc jamais rendu.
 * Ceux-ci rendent l'écran chargé et interagissent avec les vrais contrôles.
 */
describe('RapportsListComponent — rendu réel des KPI et du chargement', () => {
  it('affiche le squelette pendant le chargement puis les KPI une fois les stats reçues', async () => {
    const { fixture } = monter();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.rap-skeleton')).toBeTruthy();

    await flush();
    fixture.detectChanges();

    expect(racine.querySelector('.rap-skeleton')).toBeNull();
    const kpis = racine.querySelectorAll('.kpi__value');
    expect(kpis.length).toBe(4);
    expect(kpis[0].textContent).toContain('m³'); // formatM3(consommationTotaleGlobale)
    expect(kpis[0].textContent).toMatch(/1[\s ]000 m³/);
    expect(kpis[3].textContent?.trim()).toBe('60%'); // tauxRecouvrement (60 000 / 100 000)
  });

  it('affiche le bandeau d’erreur et relance le chargement au clic sur Réessayer', async () => {
    const query = vi.fn()
      .mockReturnValueOnce(throwError(() => new Error('Panne réseau')))
      .mockReturnValueOnce(of({ data: { statsGlobales: stats() } }));
    const { fixture } = monter({ query });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const banniere = racine.querySelector('app-error-banner');
    expect(banniere?.textContent).toContain('Panne réseau');

    banniere!.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    fixture.detectChanges();

    expect(query).toHaveBeenCalledTimes(2);
    expect(racine.querySelector('app-error-banner')).toBeNull();
    expect(racine.querySelectorAll('.kpi__value').length).toBe(4);
  });

  it('n’affiche pas la section historique quand la campagne n’a aucun antécédent', async () => {
    const { fixture } = monter({
      query: vi.fn().mockReturnValue(of({ data: { statsGlobales: stats({ historiqueCampagnes: [] }) } })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.rap-table-wrap')).toBeNull();
  });

  it('affiche le tableau d’historique avec le libellé de campagne désambiguïsé', async () => {
    const { fixture } = monter({
      query: vi.fn().mockReturnValue(
        of({
          data: {
            statsGlobales: stats({
              historiqueCampagnes: [
                { campagneId: 'c-1', nomCampagne: 'Août 2026', totalAbonnes: 10, nbReleves: 8, pourcentageProgression: 80, consommationTotale: 500 } as never,
              ],
            }),
          },
        }),
      ),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const ligne = racine.querySelector('.rap-table tbody tr')!;
    expect(ligne.querySelector('.rap-camp')?.textContent).toBe('Août 2026');
    const cellules = ligne.querySelectorAll('.col-num');
    expect(cellules[0].textContent).toContain('8 / 10');
    expect(cellules[1].textContent).toContain('500 m³');
    expect(cellules[2].textContent).toContain('80%');
  });
});

describe('RapportsListComponent — rendu réel de la barre d’export', () => {
  it('bascule entre les modes campagne et période au clic, avec aria-pressed correct', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const [modeCampagne, modePeriode] = Array.from(racine.querySelectorAll<HTMLButtonElement>('.rap-mode'));
    expect(modeCampagne.getAttribute('aria-pressed')).toBe('true');
    expect(racine.querySelector('p-select')).toBeTruthy();
    expect(racine.querySelectorAll('p-datepicker').length).toBe(0);

    modePeriode.click();
    fixture.detectChanges();

    expect(modePeriode.getAttribute('aria-pressed')).toBe('true');
    expect(modeCampagne.getAttribute('aria-pressed')).toBe('false');
    expect(racine.querySelectorAll('p-datepicker').length).toBe(2);
    expect(racine.querySelector('p-select')).toBeNull();
  });

  it('affiche l’erreur de période inversée uniquement en mode période et avec les bonnes bornes', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.rap-mode')!.nextElementSibling!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    c.dateDebut.set(new Date('2026-08-10'));
    c.dateFin.set(new Date('2026-08-01'));
    fixture.detectChanges();

    expect(racine.querySelector('.rap-export-bar__erreur')?.textContent).toContain('PERIODE_INVERSEE');
  });

  it('lance l’export Factures depuis le vrai bouton et affiche le spinner pendant l’appel', async () => {
    let resolve!: () => void;
    const enVol = new Promise<void>((r) => (resolve = r));
    const { fixture, facturesCsv } = monter({ facturesCsv: vi.fn().mockReturnValue(enVol) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartes = Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-card'));
    const carteFactures = cartes[0];
    expect(carteFactures.disabled).toBe(false);

    carteFactures.click();
    fixture.detectChanges();

    expect(facturesCsv).toHaveBeenCalledWith({ campagneId: 'c-1' });
    expect(carteFactures.querySelector('.pi-spinner')).toBeTruthy();
    // Pendant un export, les AUTRES cartes sont aussi désactivées (un seul export à la fois).
    expect(cartes[1].disabled).toBe(true);

    resolve();
    await flush();
    fixture.detectChanges();

    expect(carteFactures.querySelector('.pi-spinner')).toBeNull();
    expect(carteFactures.querySelector('.pi-download')).toBeTruthy();
  });

  it('les quatre cartes d’export appellent chacune le bon service, dans le vrai DOM', async () => {
    const { fixture, facturesCsv, paiementsCsv, synthesePdf, bilanImpayesPdf } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartes = Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-card'));
    expect(cartes.length).toBe(4);

    cartes[1].click();
    await flush();
    fixture.detectChanges();
    expect(paiementsCsv).toHaveBeenCalledWith({ campagneId: 'c-1' });

    cartes[2].click();
    await flush();
    fixture.detectChanges();
    expect(synthesePdf).toHaveBeenCalledWith('c-1');

    cartes[3].click();
    await flush();
    fixture.detectChanges();
    expect(bilanImpayesPdf).toHaveBeenCalledTimes(1);

    expect(facturesCsv).not.toHaveBeenCalled();
  });

  it('désactive les cartes CSV/synthèse quand aucune campagne n’est sélectionnable', async () => {
    const { fixture } = monter({
      query: vi.fn().mockReturnValue(of({ data: { statsGlobales: stats({ historiqueCampagnes: [] }) } })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartes = Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-card'));
    // Factures, Paiements, Synthèse dépendent d'une campagne sélectionnée ; Bilan reste actif.
    expect(cartes[0].disabled).toBe(true);
    expect(cartes[1].disabled).toBe(true);
    expect(cartes[2].disabled).toBe(true);
    expect(cartes[3].disabled).toBe(false);
  });

  it('affiche le message d’erreur du toast quand l’export échoue', async () => {
    const { fixture } = monter({ facturesCsv: vi.fn().mockRejectedValue(new Error('Export impossible')) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.export-card')!.click();
    await flush();
    fixture.detectChanges();

    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith('Export impossible');
  });

  it('affiche le message générique du toast au succès d’un export', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.export-card')!.click();
    await flush();

    const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('EXPORT_DONE'));
  });

  it('libelleCritere reflète le mode et les bornes choisies, tel qu’affiché sous les cartes', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.export-card__sub')?.textContent).toContain('PAR_CAMPAGNE');

    racine.querySelectorAll<HTMLButtonElement>('.rap-mode')[1].click();
    fixture.detectChanges();
    expect(racine.querySelector('.export-card__sub')?.textContent).toContain('TOUT_HISTORIQUE');

    c.dateDebut.set(new Date(2026, 7, 1));
    fixture.detectChanges();
    expect(racine.querySelector('.export-card__sub')?.textContent).toContain('PERIODE_DEPUIS');

    c.dateFin.set(new Date(2026, 7, 31));
    fixture.detectChanges();
    expect(racine.querySelector('.export-card__sub')?.textContent).toContain('01/08/2026');
  });
});

describe('RapportsListComponent — replis génériques et gardes', () => {
  it('campagneOptions() est vide tant que les stats ne sont pas chargées', () => {
    const { c } = monter();
    expect(c.campagneOptions()).toEqual([]);
  });

  it('criteresExport() retombe sur une chaîne vide sans campagne sélectionnée', () => {
    const { c } = monter();
    c.selectedCampagneId.set(null);
    expect(c.criteresExport()).toEqual({ campagneId: '' });
  });

  it('exportPaiements ne fait rien si les critères ne sont pas prêts', async () => {
    const { c, paiementsCsv } = monter();
    c.selectedCampagneId.set(null);
    c.exportPaiements();
    await flush();
    expect(paiementsCsv).not.toHaveBeenCalled();
  });

  it('exportSynthese ne fait rien sans campagne sélectionnée', async () => {
    const { c, synthesePdf } = monter();
    c.selectedCampagneId.set(null);
    c.exportSynthese();
    await flush();
    expect(synthesePdf).not.toHaveBeenCalled();
  });

  it('affiche le message d’erreur générique quand le chargement échoue sans message exploitable', async () => {
    const { fixture, c } = monter({ query: vi.fn().mockReturnValue(throwError(() => new Error())) });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toContain('ERROR_LOAD');
  });

  it('affiche le message générique du toast quand l’export échoue avec une valeur non-Error', async () => {
    const { c } = monter({ facturesCsv: vi.fn().mockRejectedValue('chaîne brute, pas une Error') });
    c.selectedCampagneId.set('c-1');
    c.exportFactures();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'));
  });
});
