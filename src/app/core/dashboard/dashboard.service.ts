import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { GET_STATS_GLOBALES, GET_STATS_PAR_MOIS } from '../../graphql/queries/stats.queries';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';
import { AgentAffecte, Campagne } from '../../shared/models/campagne.model';
import { Facture, Paiement, SoldeFacture } from '../../shared/models/facture.model';
import { CampagnesService } from '../campagnes/campagnes.service';
import { FacturesService } from '../factures/factures.service';

/**
 * Données brutes issues du backend Reporting — cumulé "depuis toujours".
 * La dimension temporelle (mois vs mois précédent) est reconstruite ici côté
 * frontend en croisant `historiqueCampagnes` avec `Campagne.periodeMois/Annee`.
 */
export interface StatsGlobales {
  consommationTotaleGlobale: number;
  montantTotalFactureGlobal: number;
  montantTotalEncaisseGlobal: number;
  historiqueCampagnes?: HistoriqueCampagne[];
}

export interface HistoriqueCampagne {
  campagneId: string;
  nomCampagne: string;
  totalAbonnes: number;
  nbReleves: number;
  pourcentageProgression: number;
  consommationTotale: number;
}

/**
 * Agrégat mensuel réel exposé par le backend via `statsParMois`. Remplace la
 * dérivation approximative frontend (v3.2) qui répartissait proportionnellement
 * `montantTotalEncaisseGlobal` selon la conso mensuelle des campagnes.
 *
 * Sémantique backend (attention aux différences vs l'ancienne dérivation) :
 * - `encaisse` = paiements par mois de paiement (pas par mois de conso)
 * - `facture` / `consommation` = par mois de génération de la facture
 * - Fenêtre glissante zéro-remplie : un mois sans donnée = ligne à 0
 *
 * `mois` = "AAAA-MM" pour tri lexico chronologique.
 */
export interface StatsMois {
  mois: string;
  annee: number;
  moisNum: number;
  encaisse: number;
  facture: number;
  consommation: number;
  nbPaiements: number;
  nbFactures: number;
}

/** Delta d'un metric d'un mois vs le précédent. `null` = incalculable. */
export interface DeltaMois {
  value: number;             // valeur du mois courant
  previous: number | null;   // valeur du mois précédent (null si premier mois)
  deltaPct: number | null;   // (courant - précédent) / précédent × 100
}

/**
 * Service dashboard — charge en parallèle les 3-4 sources dont le tableau de
 * bord a besoin, dégrade proprement chaque source qui tombe (null au lieu de
 * casser l'écran), et compose les données mensuelles côté frontend puisque le
 * backend Reporting est cumulé.
 *
 * Cache 30s pour éviter les rechargements en cascade (pattern déjà utilisé sur
 * `FacturesService.facturesCache`). Invalidation manuelle via `invalidate()`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly apollo = inject(Apollo);
  private readonly facturesService = inject(FacturesService);
  private readonly campagnesService = inject(CampagnesService);

  /**
   * Charge en parallèle les agents affectés de N campagnes. Utilisé par la
   * vue Superviseur pour enrichir chaque card avec ses agents et statuts.
   * Retourne un Map campagneId → agents (une clé absente = fetch failed).
   */
  async loadAgentsByCampagne(campagneIds: string[]): Promise<Map<string, AgentAffecte[]>> {
    if (!campagneIds.length) return new Map();
    const results = await Promise.allSettled(
      campagneIds.map(async (id) => ({ id, agents: await this.campagnesService.getAgentsCampagne(id) })),
    );
    const map = new Map<string, AgentAffecte[]>();
    for (const r of results) {
      if (r.status === 'fulfilled') map.set(r.value.id, r.value.agents);
    }
    return map;
  }

  private cache: {
    stats: StatsGlobales | null;
    statsParMois: StatsMois[] | null;
    campagnes: Campagne[] | null;
    impayes: SoldeFacture[] | null;
    paiements: Paiement[] | null;
    factures: Facture[] | null;
    ts: number;
  } | null = null;
  private static readonly TTL_MS = 30_000;

  invalidate(): void { this.cache = null; }

  /**
   * Charge en parallèle les 4 sources. Chacune est indépendante : une source
   * qui tombe (backend en panne, refusée par droits) renvoie `null` sans
   * bloquer les autres. Le composant décide comment afficher les gaps.
   */
  async loadAll(): Promise<{
    stats: StatsGlobales | null;
    statsParMois: StatsMois[] | null;
    campagnes: Campagne[] | null;
    impayes: SoldeFacture[] | null;
    paiements: Paiement[] | null;
    factures: Facture[] | null;
  }> {
    if (this.cache && Date.now() - this.cache.ts < DashboardService.TTL_MS) {
      return this.cache;
    }
    const [stats, statsParMois, campagnes, impayes, paiements, factures] = await Promise.all([
      this.loadStats(),
      this.loadStatsParMois(),
      this.loadCampagnes(),
      this.loadImpayes(),
      this.loadPaiements(),
      this.loadFactures(),
    ]);
    this.cache = { stats, statsParMois, campagnes, impayes, paiements, factures, ts: Date.now() };
    return this.cache;
  }

  /**
   * Recharge UNE seule source — les autres sont conservées telles quelles dans
   * le cache. Vrai retry ciblé (fix v3 P1) : quand la source Impayés tombe et
   * que l'utilisateur retry "Impayés", on ne re-fetch pas Stats/Paiements/etc.
   * qui n'ont pas de raison d'être rechargés. Retourne l'état complet mis à
   * jour pour que le composant sette ses signals.
   */
  async reloadSource(
    source: 'stats' | 'statsParMois' | 'campagnes' | 'impayes' | 'paiements' | 'factures',
  ): Promise<{
    stats: StatsGlobales | null;
    statsParMois: StatsMois[] | null;
    campagnes: Campagne[] | null;
    impayes: SoldeFacture[] | null;
    paiements: Paiement[] | null;
    factures: Facture[] | null;
  }> {
    // Cache actuel comme base (les autres sources restent inchangées).
    const base = this.cache ?? {
      stats: null, statsParMois: null, campagnes: null,
      impayes: null, paiements: null, factures: null, ts: 0,
    };
    switch (source) {
      case 'stats': base.stats = await this.loadStats(); break;
      case 'statsParMois': base.statsParMois = await this.loadStatsParMois(); break;
      case 'campagnes': base.campagnes = await this.loadCampagnes(); break;
      case 'impayes': base.impayes = await this.loadImpayes(); break;
      case 'paiements': base.paiements = await this.loadPaiements(); break;
      case 'factures': base.factures = await this.loadFactures(); break;
    }
    base.ts = Date.now();
    this.cache = base;
    return {
      stats: base.stats,
      statsParMois: base.statsParMois,
      campagnes: base.campagnes,
      impayes: base.impayes,
      paiements: base.paiements,
      factures: base.factures,
    };
  }

  private async loadStats(): Promise<StatsGlobales | null> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<{ statsGlobales: StatsGlobales }>({
          query: GET_STATS_GLOBALES,
          fetchPolicy: 'network-only',
          context: { silentError: true },
        }),
      );
      return res.data?.statsGlobales ?? null;
    } catch { return null; }
  }

  /**
   * Charge l'agrégat mensuel réel (12 mois glissants par défaut). Backend
   * gère l'exactitude (paiements par mois de paiement, factures par mois de
   * génération, zéro-remplissage, filtrage superviseur par createdBy).
   */
  private async loadStatsParMois(): Promise<StatsMois[] | null> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<{ statsParMois: StatsMois[] }>({
          query: GET_STATS_PAR_MOIS,
          variables: { nbMois: 12 },
          fetchPolicy: 'network-only',
          context: { silentError: true },
        }),
      );
      return res.data?.statsParMois ?? null;
    } catch { return null; }
  }

  private async loadCampagnes(): Promise<Campagne[] | null> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<{ campagnes: Campagne[] }>({
          query: GET_CAMPAGNES,
          fetchPolicy: 'network-only',
          context: { silentError: true },
        }),
      );
      return res.data?.campagnes ?? null;
    } catch { return null; }
  }

  private async loadImpayes(): Promise<SoldeFacture[] | null> {
    try { return await this.facturesService.getImpayes(); }
    catch { return null; }
  }

  private async loadPaiements(): Promise<Paiement[] | null> {
    try { return await this.facturesService.getAllPaiements(); }
    catch { return null; }
  }

  private async loadFactures(): Promise<Facture[] | null> {
    try { return await this.facturesService.getFactures(); }
    catch { return null; }
  }

  /**
   * Delta d'un metric entre le mois courant (`[0]`) et le précédent (`[1]`)
   * dans le tableau `statsParMois` renvoyé par le backend. `deltaPct = null`
   * quand le mois précédent est 0 ou absent (premier mois de suivi).
   *
   * Fix v3.3 : plus de dérivation approximative — on lit directement les
   * champs exacts du backend (`encaisse` par mois de paiement, `facture` et
   * `consommation` par mois de génération de la facture).
   */
  computeDelta(
    parMois: StatsMois[] | null,
    metric: 'encaisse' | 'facture' | 'consommation',
  ): DeltaMois {
    const list = parMois ?? [];
    const current = list[0]?.[metric] ?? 0;
    const previous = list[1]?.[metric] ?? null;
    let deltaPct: number | null = null;
    if (previous !== null && previous > 0) {
      deltaPct = ((current - previous) / previous) * 100;
    }
    return { value: current, previous, deltaPct };
  }
}
