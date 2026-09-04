import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { AgentsPanelComponent } from './agents-panel.component';
import type { AgentAffecte, ZoneRepartition } from '../../../../shared/models/campagne.model';

/**
 * Panneau « Agents affectés » (cartes) + « Répartition par zone » (table) de
 * la fiche campagne. Les deux dérivent de `agentsData`/`repartData` fournis
 * par le parent — ces tests portent sur ce calcul dérivé avec plusieurs jeux
 * de données (aucun agent, un seul, plusieurs, zones multiples au même
 * quartier) et sur l'asymétrie documentée dans le composant : la grille de
 * cartes est gatée par `canActOnCampagne`, la répartition par zone non.
 */
function agent(p: Partial<AgentAffecte> = {}): AgentAffecte {
  return {
    agentId: 'ag-1',
    username: 'jean.dupont',
    role: 'AGENT',
    statut: 'ACTIF',
    derniereActivite: null,
    nbReleves: 0,
    zones: [],
    ...p,
  };
}

function zone(p: Partial<ZoneRepartition> = {}): ZoneRepartition {
  return {
    quartier: 'Bastos',
    camp: 1,
    agentId: 'ag-1',
    agentUsername: 'jean.dupont',
    nbAbonnes: 10,
    nbReleves: 5,
    pct: 50,
    ...p,
  };
}

describe('AgentsPanelComponent', () => {
  function monter(over: {
    agentsData?: AgentAffecte[];
    repartData?: ZoneRepartition[];
    canActOnCampagne?: boolean;
    avecTraductions?: boolean;
  } = {}) {
    TestBed.configureTestingModule({
      imports: [AgentsPanelComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });

    if (over.avecTraductions) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr', fr as unknown as TranslationObject);
      translate.use('fr');
    }

    const fixture = TestBed.createComponent(AgentsPanelComponent);
    fixture.componentRef.setInput('agentsData', over.agentsData ?? []);
    fixture.componentRef.setInput('repartData', over.repartData ?? []);
    fixture.componentRef.setInput('canActOnCampagne', over.canActOnCampagne ?? true);
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      cartes: () => [...racine.querySelectorAll('.agent-card')] as HTMLElement[],
      lignesZone: () => [...racine.querySelectorAll('.zone-table tbody tr')] as HTMLElement[],
    };
  }

  // ── agentsAffectes() : total abonnés, progression, groupement de zones ───

  describe('agentsAffectes', () => {
    it('un agent sans zone affichée dans la répartition a un total de zéro et 0% (pas une division par zéro qui plante)', () => {
      const { c } = monter({ agentsData: [agent({ nbReleves: 3 })], repartData: [] });
      const [a] = c.agentsAffectes();
      expect(a.nbAbonnes).toBe(0);
      expect(a.nbReleves).toBe(3);
      expect(a.pct).toBe(0);
    });

    it('le total d’un agent additionne uniquement SES lignes de répartition', () => {
      const { c } = monter({
        agentsData: [agent({ agentId: 'ag-1' }), agent({ agentId: 'ag-2', username: 'awa.ba' })],
        repartData: [
          zone({ agentId: 'ag-1', nbAbonnes: 10 }),
          zone({ agentId: 'ag-1', quartier: 'Centre', nbAbonnes: 15 }),
          zone({ agentId: 'ag-2', nbAbonnes: 999 }), // ne doit pas polluer le total de ag-1
        ],
      });
      const parAgent = Object.fromEntries(c.agentsAffectes().map((a) => [a.id, a.nbAbonnes]));
      expect(parAgent['ag-1']).toBe(25);
      expect(parAgent['ag-2']).toBe(999);
    });

    it('le pourcentage se calcule sur nbReleves / total réparti, arrondi', () => {
      const { c } = monter({
        agentsData: [agent({ nbReleves: 1 })],
        repartData: [zone({ nbAbonnes: 3 })], // 1/3 = 33.33…
      });
      expect(c.agentsAffectes()[0].pct).toBe(33);
    });

    it('100% quand tout est relevé', () => {
      const { c } = monter({
        agentsData: [agent({ nbReleves: 10 })],
        repartData: [zone({ nbAbonnes: 10 })],
      });
      expect(c.agentsAffectes()[0].pct).toBe(100);
    });

    it('regroupe les camps d’un même quartier en une seule pastille', () => {
      const { c } = monter({
        agentsData: [
          agent({
            zones: [
              { quartier: 'Bastos', camp: 1 },
              { quartier: 'Bastos', camp: 5 },
              { quartier: 'Centre', camp: 2 },
            ],
          }),
        ],
      });
      const groupes = c.agentsAffectes()[0].zonesGroupees;
      expect(groupes).toHaveLength(2);
      const bastos = groupes.find((g) => g.nom === 'Bastos');
      expect(bastos?.camps).toEqual([1, 5]);
    });

    it('les initiales viennent des deux premiers segments du username, sinon des deux premières lettres', () => {
      const { c } = monter({
        agentsData: [agent({ username: 'jean.dupont' }), agent({ agentId: 'ag-2', username: 'awa' })],
      });
      const [a1, a2] = c.agentsAffectes();
      expect(a1.initials).toBe('JD');
      expect(a2.initials).toBe('AW');
    });
  });

  // ── Statut de tournée : normalisation tolérante d'une chaîne backend ──────

  describe('agentStatutClass / agentStatutLabel', () => {
    it.each([
      ['EN_TOURNEE', 'agent-statut--tournee', 'CAMPAGNES.AGENT_STATUT.EN_TOURNEE'],
      ['ACTIF', 'agent-statut--actif', 'CAMPAGNES.AGENT_STATUT.ACTIF'],
      ['EN_RETARD', 'agent-statut--retard', 'CAMPAGNES.AGENT_STATUT.EN_RETARD'],
    ] as const)('normalise "%s"', (statut, classe, cle) => {
      const { c } = monter();
      expect(c.agentStatutClass(statut)).toBe(classe);
      expect(c.agentStatutLabel(statut)).toBe(cle);
    });

    it('une chaîne backend en variante de casse est reconnue quand même', () => {
      const { c } = monter();
      expect(c.agentStatutClass('active')).toBe('agent-statut--actif');
      expect(c.agentStatutClass('Retard')).toBe('agent-statut--retard');
    });

    it('un statut null ou vide retombe sur inactif', () => {
      const { c } = monter();
      expect(c.agentStatutClass(null)).toBe('agent-statut--inactif');
      expect(c.agentStatutLabel(null)).toBe('CAMPAGNES.AGENT_STATUT.INACTIF');
    });

    it('un statut backend inconnu (ni reconnu ni vide) est renvoyé tel quel, pas traduit', () => {
      const { c } = monter();
      expect(c.agentStatutClass('CONGE')).toBe('agent-statut--inactif');
      expect(c.agentStatutLabel('CONGE')).toBe('CONGE');
    });

    /**
     * BUG DE PRODUCTION (documenté, non corrigé — hors périmètre du lot) :
     * `agents-panel.component.ts` lignes 106 et 115 testent
     * `s.includes('ACTIF')` avant de tester `INACTIF`. Or la chaîne
     * "INACTIF" CONTIENT la sous-chaîne "ACTIF" (positions 2-6). Résultat :
     * un agent dont le backend renvoie littéralement le statut "INACTIF"
     * est classé et affiché comme "Actif" (pastille verte, libellé
     * CAMPAGNES.AGENT_STATUT.ACTIF) au lieu d'"Inactif". Seule une chaîne
     * vide ou `null` atteint réellement la branche INACTIF de
     * `agentStatutLabel` (`!s || s.includes('INACTIF')` — le premier
     * opérande suffit déjà, le second ne se déclenche jamais).
     * Ce test fige le comportement actuel pour ne pas le régresser
     * silencieusement plus loin ; il ne dit pas que c'est le bon calcul.
     */
    it('« INACTIF » littéral est mal classé « actif » (bug existant, non corrigé — voir commentaire)', () => {
      const { c } = monter();
      expect(c.agentStatutClass('INACTIF')).toBe('agent-statut--actif');
      expect(c.agentStatutLabel('INACTIF')).toBe('CAMPAGNES.AGENT_STATUT.ACTIF');
    });
  });

  // ── Libellé de synchronisation relative ───────────────────────────────────

  describe('agentSyncLabel', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('sans date, affiche un tiret', () => {
      const { c } = monter();
      expect(c.agentSyncLabel(null)).toBe('—');
    });

    it('une date illisible affiche aussi un tiret, pas "Invalid Date"', () => {
      const { c } = monter();
      expect(c.agentSyncLabel('pas-une-date')).toBe('—');
    });

    it('moins d’une minute → "à l’instant"', () => {
      const { c } = monter({ avecTraductions: true });
      expect(c.agentSyncLabel('2026-08-27T11:59:45.000Z')).toBe("à l'instant");
    });

    it('quelques minutes → "il y a N min"', () => {
      const { c } = monter({ avecTraductions: true });
      expect(c.agentSyncLabel('2026-08-27T11:45:00.000Z')).toBe('il y a 15 min');
    });

    it('quelques heures → "il y a N h"', () => {
      const { c } = monter({ avecTraductions: true });
      expect(c.agentSyncLabel('2026-08-27T09:00:00.000Z')).toBe('il y a 3 h');
    });

    it('plus de 24h → "il y a N j"', () => {
      const { c } = monter({ avecTraductions: true });
      expect(c.agentSyncLabel('2026-08-25T12:00:00.000Z')).toBe('il y a 2 j');
    });
  });

  // ── repartitionZones() : rendu indépendant de canActOnCampagne ────────────

  describe('repartitionZones', () => {
    it('arrondit le pourcentage', () => {
      const { c } = monter({ repartData: [zone({ pct: 33.6 })] });
      expect(c.repartitionZones()[0].pct).toBe(34);
    });

    it('une zone sans agent porte des initiales null, pas une erreur', () => {
      const { c } = monter({ repartData: [zone({ agentId: null, agentUsername: null })] });
      expect(c.repartitionZones()[0].agentInitials).toBeNull();
    });

    it('reste peuplée même quand canActOnCampagne est faux (asymétrie voulue)', () => {
      const { c, racine } = monter({ repartData: [zone()], canActOnCampagne: false });
      expect(c.repartitionZones()).toHaveLength(1);
      expect(racine.querySelector('.zone-section')).toBeTruthy();
    });

    it('les clés distinguent deux zones de même quartier mais de camp différent', () => {
      const { c } = monter({ repartData: [zone({ camp: 1 }), zone({ camp: 2 })] });
      const cles = c.repartitionZones().map((z) => z.key);
      expect(new Set(cles).size).toBe(2);
    });
  });

  // ── Rendu : la grille de cartes est gatée, la répartition ne l'est pas ────

  describe('rendu', () => {
    it('aucune carte agent affichée sans droits, même avec des agents affectés', () => {
      const { cartes, racine } = monter({ agentsData: [agent()], canActOnCampagne: false });
      expect(cartes()).toHaveLength(0);
      expect(racine.querySelector('.agents-section')).toBeNull();
    });

    it('une carte par agent affecté quand les droits sont là', () => {
      const { cartes } = monter({
        agentsData: [agent({ agentId: 'ag-1' }), agent({ agentId: 'ag-2', username: 'awa.ba' })],
        canActOnCampagne: true,
      });
      expect(cartes()).toHaveLength(2);
    });

    it('état « en attente » quand la liste d’agents est vide', () => {
      const { racine } = monter({ agentsData: [], canActOnCampagne: true });
      expect(racine.querySelector('.agents-pending')).toBeTruthy();
    });

    it('une ligne de table par zone de répartition', () => {
      const { lignesZone } = monter({
        repartData: [zone({ quartier: 'Bastos' }), zone({ quartier: 'Centre', agentId: 'ag-2' })],
      });
      expect(lignesZone()).toHaveLength(2);
    });

    it('aucune section de répartition sans donnée', () => {
      const { racine } = monter({ repartData: [] });
      expect(racine.querySelector('.zone-section')).toBeNull();
    });

    it('émet addAgent au clic sur le bouton d’ajout', () => {
      const { c, racine } = monter({ canActOnCampagne: true });
      let appele = 0;
      c.addAgent.subscribe(() => (appele += 1));
      (racine.querySelector('.agents-section__add') as HTMLButtonElement).click();
      expect(appele).toBe(1);
    });

    it('émet editZones avec l’identité exacte de l’agent cliqué', () => {
      const { c, racine } = monter({ agentsData: [agent({ agentId: 'ag-7', username: 'koffi' })] });
      const recus: Array<{ id: string; username: string }> = [];
      c.editZones.subscribe((v) => recus.push(v));
      (racine.querySelector('.agent-zone-edit') as HTMLButtonElement).click();
      expect(recus).toEqual([{ id: 'ag-7', username: 'koffi' }]);
    });
  });

  // ── Repli des zones au-delà de zonesVisibles ───────────────────────────────

  describe('repli des zones (carte agent)', () => {
    function zonesNombreuses(n: number) {
      return Array.from({ length: n }, (_, i) => ({ quartier: `Quartier${i}`, camp: 1 }));
    }

    it('n’est pas étendu par défaut', () => {
      const { c } = monter({ agentsData: [agent({ zones: zonesNombreuses(8) })] });
      expect(c.agentZonesEstEtendu('ag-1')).toBe(false);
    });

    it('basculerAgentZones étend puis réduit, sans affecter un autre agent', () => {
      const { c } = monter({
        agentsData: [agent({ agentId: 'ag-1' }), agent({ agentId: 'ag-2', username: 'awa' })],
      });
      c.basculerAgentZones('ag-1');
      expect(c.agentZonesEstEtendu('ag-1')).toBe(true);
      expect(c.agentZonesEstEtendu('ag-2')).toBe(false);
      c.basculerAgentZones('ag-1');
      expect(c.agentZonesEstEtendu('ag-1')).toBe(false);
    });

    it('le bouton "+N" n’apparaît pas sous le seuil visible', () => {
      const { racine } = monter({ agentsData: [agent({ zones: zonesNombreuses(3) })] });
      expect(racine.querySelector('.agent-zone-more')).toBeNull();
    });

    it('le bouton "+N" apparaît et compte juste au-delà du seuil visible', () => {
      const { racine } = monter({ agentsData: [agent({ zones: zonesNombreuses(8) })] });
      const bouton = racine.querySelector('.agent-zone-more') as HTMLButtonElement;
      expect(bouton).toBeTruthy();
      // Seuil documenté dans le composant (`zonesVisibles`, protégé) : 6.
      expect(bouton.textContent?.trim()).toBe('+2');
    });
  });
});
