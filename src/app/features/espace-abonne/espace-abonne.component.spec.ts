import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { EspaceAbonneComponent } from './espace-abonne.component';
import {
  EspaceAbonneData,
  EspaceAbonneFacture,
  EspaceAbonneService,
} from '../../core/espace-abonne/espace-abonne.service';

/**
 * L'espace abonné est le seul écran que le client final voit. Il le lit sur un
 * téléphone, une fois par mois, sans avoir rien appris de l'application.
 *
 * Ce qui se teste ici n'est pas la mise en page — c'est la question à laquelle
 * l'écran répond : **est-ce que je suis en retard**. Elle se calcule à partir
 * de dates, donc elle peut être fausse silencieusement, et une réponse fausse
 * envoie soit quelqu'un payer ce qu'il ne doit pas encore, soit personne payer
 * ce qui va le faire suspendre.
 */

/**
 * Date du jour décalée de `n` jours, au format court.
 *
 * Composée à la main plutôt que par `toISOString()` : celui-ci convertit en UTC,
 * si bien qu'à l'est de Greenwich, passé minuit, il rend la veille. Ces tests
 * ont commencé à échouer à 00 h 08 pour cette seule raison — et ce n'était pas
 * eux qui avaient tort sur le fond, mais bien un décalage réel entre la date
 * qu'ils fabriquaient et celle que le composant lisait.
 */
function jours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function facture(p: Partial<EspaceAbonneFacture> = {}): EspaceAbonneFacture {
  return {
    facture_id: p.facture_id ?? 'f-1',
    numero: p.numero ?? 'FACT-2026-08-0001',
    date_releve: p.date_releve ?? jours(-20),
    montant: p.montant ?? 10_000,
    statut: p.statut ?? 'IMPAYEE',
    date_limite_paiement: p.date_limite_paiement ?? jours(10),
    solde_restant: p.solde_restant ?? 10_000,
    montant_paye: p.montant_paye ?? 0,
    nature: p.nature,
    motif: p.motif,
    ancien_index: p.ancien_index,
    nouveau_index: p.nouveau_index,
    consommation: p.consommation,
    prix_m3: p.prix_m3,
  };
}

describe('EspaceAbonneComponent', () => {
  function setup(factures: EspaceAbonneFacture[], token = 'tok-valide') {
    const data: EspaceAbonneData = {
      abonne_id: 'ab-1',
      token_expiration: jours(30),
      factures,
    };
    const svc = {
      getFactures: vi.fn().mockReturnValue(of(data)),
      pdfUrl: vi.fn().mockReturnValue('/pdf'),
    };

    TestBed.configureTestingModule({
      imports: [EspaceAbonneComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => token } } },
        },
      ],
    });

    const fixture = TestBed.createComponent(EspaceAbonneComponent);
    return { fixture, component: fixture.componentInstance, svc };
  }

  it('se construit et charge les factures du token', () => {
    const { component, svc } = setup([facture()]);
    expect(svc.getFactures).toHaveBeenCalledWith('tok-valide');
    expect(component.etat()).toBe('ready');
  });

  // ── Les trois régimes ─────────────────────────────────────────────────────
  // Le rouge n'est pas décoratif : il dit « aujourd'hui ». L'étendre à une
  // facture pas encore exigible l'userait exactement là où il doit porter.

  it("n'alarme pas quand une dette existe mais que rien n'est échu", () => {
    const { component } = setup([facture({ date_limite_paiement: jours(10) })]);
    expect(component.soldeTotal()).toBe(10_000);
    expect(component.soldeEchu()).toBe(0);
    expect(component.regime()).toBe('a-venir');
  });

  it('alarme dès quʼune seule facture est échue', () => {
    const { component } = setup([
      facture({ facture_id: 'a', date_limite_paiement: jours(10) }),
      facture({ facture_id: 'b', date_limite_paiement: jours(-5), solde_restant: 3_000 }),
    ]);
    expect(component.regime()).toBe('retard');
    expect(component.soldeTotal()).toBe(13_000);
    expect(component.soldeEchu()).toBe(3_000);
  });

  it('félicite quand tout est réglé', () => {
    const { component } = setup([facture({ solde_restant: 0, montant_paye: 10_000 })]);
    expect(component.regime()).toBe('solde');
    expect(component.soldeTotal()).toBe(0);
  });

  it("une facture échue mais soldée n'est pas un retard", () => {
    const { component } = setup([
      facture({ date_limite_paiement: jours(-40), solde_restant: 0, montant_paye: 10_000 }),
    ]);
    expect(component.regime()).toBe('solde');
    expect(component.retardMax()).toBe(0);
  });

  // ── L'ancienneté ──────────────────────────────────────────────────────────

  it("compte les jours de retard depuis l'échéance", () => {
    const { component } = setup([facture({ date_limite_paiement: jours(-31) })]);
    expect(component.lignes()[0].joursDeRetard).toBe(31);
    expect(component.retardMax()).toBe(31);
  });

  it("le jour de l'échéance n'est pas encore un retard", () => {
    const { component } = setup([facture({ date_limite_paiement: jours(0) })]);
    expect(component.lignes()[0].joursDeRetard).toBe(0);
    expect(component.regime()).toBe('a-venir');
  });

  it('annonce le nombre de jours restants avant échéance', () => {
    const { component } = setup([facture({ date_limite_paiement: jours(5) })]);
    expect(component.lignes()[0].joursRestants).toBe(5);
  });

  it("retardMax retient la plus ancienne, pas la dernière lue", () => {
    const { component } = setup([
      facture({ facture_id: 'a', date_limite_paiement: jours(-3) }),
      facture({ facture_id: 'b', date_limite_paiement: jours(-60) }),
      facture({ facture_id: 'c', date_limite_paiement: jours(-12) }),
    ]);
    expect(component.retardMax()).toBe(60);
  });

  // ── L'ordre ───────────────────────────────────────────────────────────────
  // Il doit refléter l'imputation FIFO du backend : ce qui est en tête est ce
  // qu'un versement éteindra en premier.

  it("trie les impayés du plus anciennement exigible au plus récent", () => {
    const { component } = setup([
      facture({ facture_id: 'recent', date_limite_paiement: jours(10) }),
      facture({ facture_id: 'vieux', date_limite_paiement: jours(-60) }),
      facture({ facture_id: 'moyen', date_limite_paiement: jours(-5) }),
    ]);
    expect(component.lignes().map((l) => l.facture.facture_id)).toEqual([
      'vieux',
      'moyen',
      'recent',
    ]);
  });

  it('renvoie ce qui est réglé en fin de liste', () => {
    const { component } = setup([
      facture({ facture_id: 'payee', date_limite_paiement: jours(-90), solde_restant: 0 }),
      facture({ facture_id: 'due', date_limite_paiement: jours(5) }),
    ]);
    expect(component.lignes().map((l) => l.facture.facture_id)).toEqual(['due', 'payee']);
  });

  it('la prochaine échéance est la plus proche parmi les non échues', () => {
    const { component } = setup([
      facture({ facture_id: 'loin', date_limite_paiement: jours(30) }),
      facture({ facture_id: 'proche', date_limite_paiement: jours(3) }),
    ]);
    expect(component.prochaineEcheance()).toBe(jours(3));
  });

  // ── Les régularisations ───────────────────────────────────────────────────

  it('reconnaît une régularisation à sa nature', () => {
    const { component } = setup([
      facture({ nature: 'REGULARISATION', motif: 'Arriéré 2025', numero: 'REG-2026-08-0001' }),
    ]);
    expect(component.lignes()[0].regularisation).toBe(true);
  });

  it("une facture sans nature reste une consommation", () => {
    const { component } = setup([facture({ nature: undefined })]);
    expect(component.lignes()[0].regularisation).toBe(false);
  });

  // ── Les badges ────────────────────────────────────────────────────────────

  it('distingue « en retard » de « à régler »', () => {
    const { component } = setup([
      facture({ facture_id: 'a', date_limite_paiement: jours(-5) }),
      facture({ facture_id: 'b', date_limite_paiement: jours(5) }),
    ]);
    const [enRetard, aVenir] = component.lignes();
    expect(component.badge(enRetard).classe).toBe('ea-badge--danger');
    expect(component.badge(aVenir).classe).toBe('ea-badge--neutre');
  });

  it('un paiement partiel non échu se distingue dʼune facture intacte', () => {
    const { component } = setup([
      facture({ date_limite_paiement: jours(5), solde_restant: 4_000, montant_paye: 6_000 }),
    ]);
    expect(component.badge(component.lignes()[0]).classe).toBe('ea-badge--warn');
  });

  it('une facture soldée porte le badge réglée', () => {
    const { component } = setup([facture({ solde_restant: 0, montant_paye: 10_000 })]);
    expect(component.badge(component.lignes()[0]).classe).toBe('ea-badge--ok');
  });

  // ── Robustesse ────────────────────────────────────────────────────────────

  it("une date d'échéance illisible ne contamine pas les autres calculs", () => {
    const { component } = setup([
      facture({ facture_id: 'cassee', date_limite_paiement: 'pas-une-date' }),
      facture({ facture_id: 'saine', date_limite_paiement: jours(-10), solde_restant: 2_000 }),
    ]);
    expect(component.lignes().find((l) => l.facture.facture_id === 'cassee')!.joursDeRetard).toBe(0);
    expect(component.soldeEchu()).toBe(2_000);
    expect(component.retardMax()).toBe(10);
  });

  it('un token absent ne déclenche aucun appel réseau', () => {
    const { component, svc } = setup([facture()], '');
    expect(svc.getFactures).not.toHaveBeenCalled();
    expect(component.etat()).toBe('invalid');
  });

  it('un 401 mène au message « lien invalide », pas au message dʼincident', () => {
    const { component } = setup([facture()]);
    const svc = TestBed.inject(EspaceAbonneService) as unknown as {
      getFactures: ReturnType<typeof vi.fn>;
    };
    svc.getFactures.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    component.charger();
    expect(component.etat()).toBe('invalid');
  });

  it('un 503 est réessayable, donc distinct dʼun lien mort', () => {
    const { component } = setup([facture()]);
    const svc = TestBed.inject(EspaceAbonneService) as unknown as {
      getFactures: ReturnType<typeof vi.fn>;
    };
    svc.getFactures.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );
    component.charger();
    expect(component.etat()).toBe('error');
  });

  it("sans facture, l'écran est prêt et son solde est nul", () => {
    const { component } = setup([]);
    expect(component.etat()).toBe('ready');
    expect(component.lignes()).toEqual([]);
    expect(component.soldeTotal()).toBe(0);
    expect(component.regime()).toBe('solde');
  });
});

describe('EspaceAbonneComponent · avoir', () => {
  /**
   * Le crédit ne se soustrait pas du solde affiché. Les deux montants répondent
   * à des questions différentes — « combien je dois » et « combien j'ai
   * d'avance » — et les fondre en un seul chiffre rendrait l'un et l'autre
   * incompréhensibles.
   */
  function setup(avoir: number | undefined, soldeRestant = 10_000) {
    const svc = {
      getFactures: vi.fn().mockReturnValue(
        of({
          abonne_id: 'ab-1',
          token_expiration: jours(30),
          avoir,
          factures: [
            {
              facture_id: 'f-1',
              numero: 'FACT-2026-08-0001',
              date_releve: jours(-10),
              montant: 10_000,
              statut: 'IMPAYEE',
              date_limite_paiement: jours(5),
              solde_restant: soldeRestant,
              montant_paye: 0,
            },
          ],
        }),
      ),
      pdfUrl: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [EspaceAbonneComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'tok' } } } },
      ],
    });
    return TestBed.createComponent(EspaceAbonneComponent).componentInstance;
  }

  it('expose l’avoir quand il y en a un', () => {
    expect(setup(5_000).avoir()).toBe(5_000);
  });

  it('vaut zéro quand le serveur n’en renvoie pas', () => {
    // Un serveur d’une version antérieure n’envoie pas le champ : zéro est le
    // repli honnête, annoncer un crédit inexistant serait pire.
    expect(setup(undefined).avoir()).toBe(0);
  });

  it('ne se retranche pas du solde dû', () => {
    const c = setup(4_000, 10_000);
    expect(c.soldeTotal()).toBe(10_000);
    expect(c.avoir()).toBe(4_000);
  });

  it('un avoir n’empêche pas le régime « à venir » de s’appliquer', () => {
    const c = setup(4_000, 10_000);
    expect(c.regime()).toBe('a-venir');
  });
});

describe('EspaceAbonneComponent · lecture des dates', () => {
  /**
   * Une échéance de facture n'a pas d'heure : c'est un jour du calendrier, et
   * il doit se lire dans le calendrier de celui qui regarde l'écran.
   *
   * `new Date('2026-08-27')` ne rend pas le 27 août — il rend minuit UTC ce
   * jour-là, converti dans le fuseau du navigateur. À l'ouest de Greenwich cela
   * tombe la veille au soir, et l'échéance recule d'un jour : une facture due
   * le 27 s'annonce en retard dès le 27 au matin.
   *
   * Ces tests fixent une date absolue plutôt que relative, pour que le décalage
   * se voie où qu'ils tournent.
   */
  function avecEcheance(echeance: string, aujourdhui: string) {
    vi.useFakeTimers();
    const [a, m, j] = aujourdhui.split('-').map(Number);
    vi.setSystemTime(new Date(a, m - 1, j, 9, 0, 0)); // 9 h du matin, heure locale

    const svc = {
      getFactures: vi.fn().mockReturnValue(
        of({
          abonne_id: 'ab-1',
          token_expiration: '2026-12-31',
          factures: [
            {
              facture_id: 'f-1',
              numero: 'FACT-1',
              date_releve: '2026-08-01',
              montant: 10_000,
              statut: 'IMPAYEE',
              date_limite_paiement: echeance,
              solde_restant: 10_000,
              montant_paye: 0,
            },
          ],
        }),
      ),
      pdfUrl: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [EspaceAbonneComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 't' } } } },
      ],
    });
    return TestBed.createComponent(EspaceAbonneComponent).componentInstance;
  }

  afterEach(() => vi.useRealTimers());

  it('le jour même de l’échéance, rien n’est en retard', () => {
    const c = avecEcheance('2026-08-27', '2026-08-27');
    expect(c.lignes()[0].joursDeRetard).toBe(0);
    expect(c.regime()).toBe('a-venir');
  });

  it('le lendemain, le retard vaut exactement un jour', () => {
    const c = avecEcheance('2026-08-27', '2026-08-28');
    expect(c.lignes()[0].joursDeRetard).toBe(1);
  });

  it('la veille, il reste exactement un jour', () => {
    const c = avecEcheance('2026-08-28', '2026-08-27');
    expect(c.lignes()[0].joursRestants).toBe(1);
  });

  it('un mois de retard se compte au jour près', () => {
    const c = avecEcheance('2026-07-28', '2026-08-28');
    expect(c.lignes()[0].joursDeRetard).toBe(31);
  });

  it('un horodatage complet reste lisible', () => {
    // Le service n'en envoie pas aujourd'hui, mais un backend peut se mettre à
    // horodater sans prévenir — et ce serait alors muet.
    const c = avecEcheance('2026-08-27T14:30:00+01:00', '2026-08-28');
    expect(c.lignes()[0].joursDeRetard).toBe(1);
  });
});

describe("EspaceAbonneComponent · ce qui justifie le montant", () => {
  /**
   * L'abonné voyait des montants, jamais ses mètres cubes. Il ne pouvait donc
   * pas vérifier sa facture — et un montant qu'on ne peut pas vérifier est un
   * montant qu'on contestera.
   *
   * EF-NOTIF-003 demande un « historique de consommation », §8.3 du SRS le
   * redemande. Les champs existaient côté serveur ; le payload ne les recopiait
   * pas, et l'écran ne les affichait donc pas.
   */
  function setup(f: EspaceAbonneFacture, token = 'tok-valide') {
    const svc = {
      getFactures: vi.fn().mockReturnValue(
        of({ abonne_id: 'ab-1', token_expiration: jours(30), factures: [f] } as EspaceAbonneData),
      ),
      pdfUrl: vi.fn().mockReturnValue('/pdf'),
      csvUrl: vi.fn().mockReturnValue('/espace-abonne/tok-valide/factures.csv'),
    };
    TestBed.configureTestingModule({
      imports: [EspaceAbonneComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => token } } } },
      ],
    });
    const fixture = TestBed.createComponent(EspaceAbonneComponent);
    fixture.detectChanges();
    return { cmp: fixture.componentInstance, svc, fixture };
  }

  it('affiche les deux index et le prix du m³', () => {
    const { cmp } = setup(
      facture({ ancien_index: 1240, nouveau_index: 1283, consommation: 43, prix_m3: 500 }),
    );
    const texte = cmp.releve(cmp.lignes()[0]);

    // Les attentes sont COMPOSÉES avec `toLocaleString`, jamais tapées à la
    // main : en `fr-FR`, le séparateur de milliers est une espace fine
    // insécable (U+202F), et « 1 240 » écrit au clavier ne correspond pas.
    expect(texte).toContain((1240).toLocaleString('fr-FR'));
    expect(texte).toContain((1283).toLocaleString('fr-FR'));
    expect(texte).toContain('500 FCFA/m³');
    expect(texte).toContain('→');
  });

  it('se tait sur une régularisation — aucun relevé ne la justifie', () => {
    const { cmp } = setup(facture({ nature: 'REGULARISATION', motif: 'Arriéré 2025' }));
    expect(cmp.releve(cmp.lignes()[0])).toBe('');
  });

  it("se tait plutôt que d'écrire « 0 → 0 » quand les index manquent", () => {
    const { cmp } = setup(facture({ ancien_index: undefined, nouveau_index: undefined }));
    expect(cmp.releve(cmp.lignes()[0])).toBe('');
  });

  it('se tait si les index sont incohérents plutôt que de les afficher', () => {
    const { cmp } = setup(facture({ ancien_index: 1283, nouveau_index: 1240 }));
    expect(cmp.releve(cmp.lignes()[0])).toBe('');
  });

  it('affiche les index sans le prix quand le prix manque', () => {
    const { cmp } = setup(facture({ ancien_index: 100, nouveau_index: 143, prix_m3: undefined }));
    const texte = cmp.releve(cmp.lignes()[0]);
    expect(texte).toContain('100');
    expect(texte).toContain('143');
    expect(texte).not.toContain('FCFA');
  });

  it('le relevé de compte complet se télécharge — promis deux fois par le SRS', () => {
    const ouvrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { cmp, svc } = setup(facture({ consommation: 43 }));

    cmp.telechargerCsv();

    expect(svc.csvUrl).toHaveBeenCalledWith('tok-valide');
    expect(ouvrir).toHaveBeenCalledWith(
      '/espace-abonne/tok-valide/factures.csv',
      '_blank',
      'noopener',
    );
    ouvrir.mockRestore();
  });
});
