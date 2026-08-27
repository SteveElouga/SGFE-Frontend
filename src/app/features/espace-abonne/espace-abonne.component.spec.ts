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

/** Date du jour décalée de `jours`, au format ISO court. */
function jours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

describe('EspaceAbonneComponent · accord des libellés', () => {
  /**
   * Le reste de l'application écrit « 3 jour(s) ». C'est bref, et le personnel
   * qui lit ces écrans tous les jours n'y prête plus attention. Ici le lecteur
   * est un client qui reçoit un rappel de dette : la parenthèse lui donne le ton
   * du formulaire administratif, exactement là où le message doit se lire comme
   * une phrase adressée à lui.
   */
  function composant() {
    TestBed.configureTestingModule({
      imports: [EspaceAbonneComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        {
          provide: EspaceAbonneService,
          useValue: { getFactures: vi.fn().mockReturnValue(of({ abonne_id: '', token_expiration: '', factures: [] })), pdfUrl: vi.fn() },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 't' } } } },
      ],
    });
    return TestBed.createComponent(EspaceAbonneComponent).componentInstance;
  }

  it('passe au singulier à un, au pluriel au-delà', () => {
    const c = composant();
    expect(c.pluriel('X', 1)).toBe('X_UN');
    expect(c.pluriel('X', 2)).toBe('X');
    expect(c.pluriel('X', 62)).toBe('X');
  });

  it('accorde au féminin quand le nom l’exige', () => {
    const c = composant();
    expect(c.pluriel('X', 1, '_UNE')).toBe('X_UNE');
    expect(c.pluriel('X', 3, '_UNE')).toBe('X');
  });

  it('zéro retombe sur la forme singulière — « 0 jours » ne se dit pas', () => {
    const c = composant();
    expect(c.pluriel('X', 0)).toBe('X_UN');
  });
});
