import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RelevesPanelComponent } from './releves-panel.component';
import type { ReleveLigne } from '../../../../graphql/vues';

/**
 * Panneau de progression des relevés — filtres (quartier/statut), table
 * desktop et cartes mobile. Les filtres et le regroupement par statut sont un
 * état strictement local à l'affichage : ces tests portent sur ce calcul et
 * sur ce que le panneau signale au parent (la correction d'un relevé), pas
 * sur la mutation elle-même (possédée par `CorrigerReleveSheetComponent`).
 */
function releve(p: Partial<ReleveLigne> = {}): ReleveLigne {
  return {
    releveId: 'r-1',
    abonneId: 'a-1',
    ancienIndex: 100,
    nouveauIndex: 120,
    consommation: 20,
    statut: 'RELEVE',
    observation: '',
    dateReleve: '2026-08-01',
    abonneNom: 'DUPONT',
    abonnePrenom: 'Jean',
    numeroAbonne: 'AB-0001',
    numeroCompteur: 42,
    quartier: 'Bastos',
    camp: 1,
    ...p,
  } as ReleveLigne;
}

describe('RelevesPanelComponent', () => {
  function monter(over: {
    releves?: ReleveLigne[];
    abonnesMap?: Map<string, string>;
    canActOnCampagne?: boolean;
  } = {}) {
    TestBed.configureTestingModule({
      imports: [RelevesPanelComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });

    const fixture = TestBed.createComponent(RelevesPanelComponent);
    fixture.componentRef.setInput('releves', over.releves ?? []);
    fixture.componentRef.setInput('abonnesMap', over.abonnesMap ?? new Map());
    fixture.componentRef.setInput('canActOnCampagne', over.canActOnCampagne ?? false);
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      lignes: () => [...racine.querySelectorAll('.releves-table tbody tr')] as HTMLTableRowElement[],
      cartes: () => [...racine.querySelectorAll('.rm-card')] as HTMLElement[],
      boutonsCorriger: () => [...racine.querySelectorAll('.releves-table__corriger-btn')] as HTMLButtonElement[],
    };
  }

  // ── Répartition par statut ──────────────────────────────────────────────

  describe('relevesByStatut', () => {
    it('compte zéro partout sur une liste vide', () => {
      const { c } = monter({ releves: [] });
      expect(c.relevesByStatut()).toEqual({ aRelever: 0, releve: 0, nonReleve: 0, estime: 0 });
    });

    it('distingue les quatre statuts', () => {
      const { c } = monter({
        releves: [
          releve({ releveId: 'r1', statut: 'A_RELEVER' }),
          releve({ releveId: 'r2', statut: 'RELEVE' }),
          releve({ releveId: 'r3', statut: 'NON_RELEVE' }),
          releve({ releveId: 'r4', statut: 'ESTIME' }),
          releve({ releveId: 'r5', statut: 'RELEVE' }),
        ],
      });
      expect(c.relevesByStatut()).toEqual({ aRelever: 1, releve: 2, nonReleve: 1, estime: 1 });
    });

    it('change réellement quand la liste change (pas une valeur figée)', () => {
      const { fixture, c } = monter({ releves: [releve({ statut: 'A_RELEVER' })] });
      expect(c.relevesByStatut()).toEqual({ aRelever: 1, releve: 0, nonReleve: 0, estime: 0 });

      // Le relevé vient d'être saisi par un agent : le parent pousse la liste
      // mise à jour via l'input — le décompte doit suivre, pas rester figé.
      fixture.componentRef.setInput('releves', [releve({ statut: 'RELEVE' })]);
      fixture.detectChanges();
      expect(c.relevesByStatut()).toEqual({ aRelever: 0, releve: 1, nonReleve: 0, estime: 0 });
    });
  });

  // ── Quartiers disponibles (filtre) ───────────────────────────────────────

  describe('quartiersDisponibles', () => {
    it("propose seulement l'option « Tous » quand aucun relevé n'a de quartier connu", () => {
      const { c } = monter({ releves: [releve({ abonneId: 'a-1' })], abonnesMap: new Map() });
      expect(c.quartiersDisponibles()).toEqual([
        { label: 'CAMPAGNES.FILTRE_QUARTIER', value: null },
      ]);
    });

    it('déduplique et trie les quartiers par ordre alphabétique français', () => {
      const map = new Map([
        ['a-1', 'Élig-Edzoa'],
        ['a-2', 'Bastos'],
        ['a-3', 'Bastos'], // doublon volontaire
      ]);
      const { c } = monter({
        releves: [releve({ abonneId: 'a-1' }), releve({ abonneId: 'a-2' }), releve({ abonneId: 'a-3' })],
        abonnesMap: map,
      });
      const valeurs = c.quartiersDisponibles().map((o) => o.value);
      expect(valeurs).toEqual([null, 'Bastos', 'Élig-Edzoa']);
    });
  });

  // ── Filtrage combiné ──────────────────────────────────────────────────────

  describe('relevesFiltres', () => {
    // Le filtre quartier lit exclusivement `abonnesMap` (chargée par le
    // parent), jamais `r.quartier` — voir le test dédié plus bas, qui
    // documente ce que ça implique concrètement.
    const abonnesMap = new Map([
      ['a-1', 'Bastos'],
      ['a-2', 'Bastos'],
      ['a-3', 'Centre'],
    ]);
    const jeu = [
      releve({ releveId: 'r1', abonneId: 'a-1', statut: 'RELEVE' }),
      releve({ releveId: 'r2', abonneId: 'a-2', statut: 'A_RELEVER' }),
      releve({ releveId: 'r3', abonneId: 'a-3', statut: 'RELEVE' }),
    ];

    it('sans filtre, renvoie tout', () => {
      const { c } = monter({ releves: jeu, abonnesMap });
      expect(c.relevesFiltres()).toHaveLength(3);
    });

    it('filtre par statut', () => {
      const { c } = monter({ releves: jeu, abonnesMap });
      c.filtreReleveStatut.set('RELEVE');
      expect(c.relevesFiltres().map((r) => r.releveId)).toEqual(['r1', 'r3']);
    });

    it('filtre par quartier via la carte abonnés fournie par le parent', () => {
      const { c } = monter({ releves: jeu, abonnesMap });
      c.filtreQuartier.set('Centre');
      expect(c.relevesFiltres().map((r) => r.releveId)).toEqual(['r3']);
    });

    it(
      "le quartier embarqué sur le relevé ne suffit pas à lui seul : le filtre ne " +
        "consulte QUE `abonnesMap`, jamais `r.quartier` — une carte vide (ex. rôle " +
        "AGENT, pour qui le parent ne la charge jamais) rend le filtre quartier " +
        'inopérant même si chaque relevé porte déjà sa zone.',
      () => {
        const r = releve({ releveId: 'r4', abonneId: 'a-4', quartier: 'Bastos', statut: 'RELEVE' });
        const { c } = monter({ releves: [r], abonnesMap: new Map() });
        c.filtreQuartier.set('Bastos');
        expect(c.relevesFiltres()).toHaveLength(0);
      },
    );

    it('combine statut et quartier', () => {
      const { c } = monter({ releves: jeu, abonnesMap });
      c.filtreReleveStatut.set('RELEVE');
      c.filtreQuartier.set('Bastos');
      expect(c.relevesFiltres().map((r) => r.releveId)).toEqual(['r1']);
    });
  });

  // ── Chips mobile (M-05) ───────────────────────────────────────────────────

  describe('releveChips / releveChipValue', () => {
    it('porte les compteurs de relevesByStatut, pas des valeurs indépendantes', () => {
      const { c } = monter({
        releves: [
          releve({ releveId: 'r1', statut: 'RELEVE' }),
          releve({ releveId: 'r2', statut: 'RELEVE' }),
          releve({ releveId: 'r3', statut: 'ESTIME' }),
        ],
      });
      const parValeur = Object.fromEntries(c.releveChips().map((ch) => [ch.value, ch.count]));
      expect(parValeur).toEqual({ RELEVE: 2, ESTIME: 1, NON_RELEVE: 0, A_RELEVER: 0 });
    });

    it("« Tous » vaut null côté chip, 'TOUS' côté signal interne", () => {
      const { c } = monter();
      expect(c.filtreReleveStatut()).toBe('TOUS');
      expect(c.releveChipValue()).toBeNull();
      c.onReleveChip('RELEVE');
      expect(c.filtreReleveStatut()).toBe('RELEVE');
      expect(c.releveChipValue()).toBe('RELEVE');
      c.onReleveChip(null);
      expect(c.filtreReleveStatut()).toBe('TOUS');
    });
  });

  // ── Rendu ──────────────────────────────────────────────────────────────────

  it("affiche un message d'état vide quand la liste filtrée est vide", () => {
    const { racine } = monter({ releves: [] });
    expect(racine.querySelector('.releves-empty-row')).toBeTruthy();
    expect(racine.textContent).toMatch(/CAMPAGNES\.RELEVES_EMPTY/);
  });

  it('une ligne de tableau par relevé filtré, pas plus', () => {
    const { lignes } = monter({
      releves: [
        releve({ releveId: 'r1' }),
        releve({ releveId: 'r2', abonneId: 'a-2' }),
        releve({ releveId: 'r3', abonneId: 'a-3' }),
      ],
    });
    expect(lignes()).toHaveLength(3);
  });

  it('la colonne « Actions » et le bouton corriger sont absents pour un rôle sans droits', () => {
    const { racine, boutonsCorriger } = monter({
      releves: [releve({ statut: 'RELEVE' })],
      canActOnCampagne: false,
    });
    expect(racine.querySelector('.col-actions')).toBeNull();
    expect(boutonsCorriger()).toHaveLength(0);
  });

  it('le bouton corriger apparaît seulement sur un relevé RELEVE, pour un rôle habilité', () => {
    const { boutonsCorriger } = monter({
      releves: [
        releve({ releveId: 'r1', statut: 'RELEVE' }),
        releve({ releveId: 'r2', abonneId: 'a-2', statut: 'A_RELEVER' }),
        releve({ releveId: 'r3', abonneId: 'a-3', statut: 'ESTIME' }),
      ],
      canActOnCampagne: true,
    });
    // Un seul des trois relevés (RELEVE) porte le bouton de correction.
    expect(boutonsCorriger()).toHaveLength(1);
  });

  it('cliquer sur corriger émet exactement ce relevé au parent', () => {
    const r1 = releve({ releveId: 'r1', statut: 'RELEVE' });
    const { c, boutonsCorriger } = monter({ releves: [r1], canActOnCampagne: true });
    const recus: ReleveLigne[] = [];
    c.corriger.subscribe((r) => recus.push(r));

    boutonsCorriger()[0].click();

    expect(recus).toHaveLength(1);
    expect(recus[0].releveId).toBe('r1');
  });
});
