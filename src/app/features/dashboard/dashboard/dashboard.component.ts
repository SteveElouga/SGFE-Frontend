import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { nomAbonneOuReference } from '../../../shared/utils/abonne.utils';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService, StatsGlobales, StatsMois, DeltaMois } from '../../../core/dashboard/dashboard.service';
import { AgentAffecte, Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { Facture, Paiement, SoldeFacture } from '../../../shared/models/facture.model';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';

/**
 * Ligne "impayé le plus ancien" pour la liste top-5 Comptable.
 * Enrichie du numéro d'abonné (via facture) et des jours de retard.
 */
interface ImpayeAncien {
  factureId: string;
  numeroAbonne: string;
  nom: string;
  jours: number;
  solde: number;
}

/** Card campagne pour vue Admin/Superviseur. */
interface CampagneCard {
  campagneId: string;
  nom: string;
  statut: string;
  pourcentage: number;
  nbReleves: number;
  totalAbonnes: number;
}

/** Card enrichie pour Superviseur : campagne + ses agents + statut visuel. */
interface SuperviseurCard extends CampagneCard {
  agents: AgentAffecte[];
  nbAgentsActifs: number;
  nbAgentsInactifs: number;
}

/** Étape du ribbon 4-cycle Admin — null quand la source est indisponible. */
interface RibbonStep {
  count: number;
  label: string;
}

/** Action requise typée pour panneau Superviseur. */
interface SuperviseurAction {
  key: string;
  labelKey: string;              // clé i18n avec params
  params: Record<string, string | number>;
  severity: 'info' | 'warning' | 'danger';
  routerLink?: string | string[];
}

/**
 * Dashboard SGFE — 3 vues role-conditionnelles dans un composant unique.
 * Comptable : héros FCFA "où est l'argent" + 3 KPI + top 5 impayés.
 * Admin : ribbon 4 KPI cycle + m³ (spécificité SGFE eau) + campagnes actives.
 * Superviseur : ses campagnes (filter createdBy) + actions requises.
 *
 * Brief : `.impeccable/surfaces/src-app-features-dashboard.md` (post-shape v3.2)
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    TranslatePipe,
    PageTopbarComponent,
    SkeletonComponent,
    TooltipDirective,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly service = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  // ── State loading + sources (null = source dégradée, retry ciblé possible) ─
  readonly loading = signal(true);
  readonly stats = signal<StatsGlobales | null>(null);
  /**
   * Agrégat mensuel réel exposé par le backend v3.3 (`statsParMois`).
   * Remplace la dérivation approximative v3.2 qui répartissait proportionnellement.
   */
  readonly statsParMois = signal<StatsMois[] | null>(null);
  readonly campagnes = signal<Campagne[] | null>(null);
  readonly impayes = signal<SoldeFacture[] | null>(null);
  readonly paiements = signal<Paiement[] | null>(null);
  readonly factures = signal<Facture[] | null>(null);
  /** Agents affectés par campagne — chargés uniquement pour Superviseur. */
  readonly agentsByCampagne = signal<Map<string, AgentAffecte[]>>(new Map());

  /**
   * Sélecteur période temporelle — Phase 3 v4 (H7 Flexibilité attack).
   * `mois-1` = mois courant vs mois précédent (défaut, brief v3.3).
   * `mois-3` = trimestre courant vs trimestre précédent (moyenne).
   * `mois-6` = semestre.
   * `mois-12` = année complète (année civile en cours vs précédente).
   * Persist localStorage `dashboard.periode`.
   */
  readonly periode = signal<'mois-1' | 'mois-3' | 'mois-6' | 'mois-12'>(
    (typeof localStorage !== 'undefined'
      && (localStorage.getItem('dashboard.periode') as 'mois-1' | 'mois-3' | 'mois-6' | 'mois-12'))
    || 'mois-1',
  );

  /**
   * Options du sélecteur période — labels via i18n key.
   * `nb` = nombre de mois à agréger pour la période courante.
   */
  readonly periodeOptions = [
    { key: 'mois-1' as const, labelKey: 'DASHBOARD.PERIODE.MOIS_1', nb: 1 },
    { key: 'mois-3' as const, labelKey: 'DASHBOARD.PERIODE.MOIS_3', nb: 3 },
    { key: 'mois-6' as const, labelKey: 'DASHBOARD.PERIODE.MOIS_6', nb: 6 },
    { key: 'mois-12' as const, labelKey: 'DASHBOARD.PERIODE.MOIS_12', nb: 12 },
  ];

  /** Nombre de mois agrégés pour la période courante (1, 3, 6, 12). */
  readonly periodeNbMois = computed(() =>
    this.periodeOptions.find((o) => o.key === this.periode())?.nb ?? 1,
  );

  /**
   * Agrégat période courante : somme les `nb` premiers mois pour chaque metric.
   * Ex: `mois-3` = [0]+[1]+[2] pour encaisse/facture/conso.
   */
  private aggregatePeriode(nbMois: number, offset: number): { encaisse: number; facture: number; consommation: number } {
    const list = this.statsParMois() ?? [];
    const slice = list.slice(offset, offset + nbMois);
    return {
      encaisse: slice.reduce((s, m) => s + m.encaisse, 0),
      facture: slice.reduce((s, m) => s + m.facture, 0),
      consommation: slice.reduce((s, m) => s + m.consommation, 0),
    };
  }

  /**
   * Delta période courante vs période précédente (mêmes nb de mois décalés).
   * Ex: `mois-3` = agrégat [0..2] vs [3..5], deltaPct = (courante - précédente) / précédente × 100.
   * `null.deltaPct` = période précédente à 0 ou incalculable (early tenant).
   */
  private computeDeltaPeriode(metric: 'encaisse' | 'facture' | 'consommation'): DeltaMois {
    const nb = this.periodeNbMois();
    const courante = this.aggregatePeriode(nb, 0);
    const precedente = this.aggregatePeriode(nb, nb);
    const value = courante[metric];
    const previous = precedente[metric] || null;
    let deltaPct: number | null = null;
    if (previous !== null && previous > 0) {
      deltaPct = ((value - previous) / previous) * 100;
    }
    return { value, previous, deltaPct };
  }

  /**
   * Change la période sélectionnée. Persist localStorage. Les computeds
   * `deltaEncaisse`/`deltaFacture`/`deltaConso` recomputent automatiquement.
   */
  setPeriode(p: 'mois-1' | 'mois-3' | 'mois-6' | 'mois-12'): void {
    this.periode.set(p);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dashboard.periode', p);
    }
  }

  // ── Rôle courant → détermine quelle composition rendre ────────────────────
  readonly role = this.auth.role;
  readonly isAdmin = this.auth.isAdmin;
  readonly isComptable = this.auth.isComptable;
  readonly isSuperviseur = this.auth.isSuperviseur;
  /** Fallback Admin pour tout rôle non-mappé (safety net). */
  readonly viewMode = computed<'comptable' | 'admin' | 'superviseur'>(() => {
    if (this.isComptable()) return 'comptable';
    if (this.isSuperviseur()) return 'superviseur';
    return 'admin';
  });

  // ── Deltas selon période (Phase 3 v4 : mois-1 défaut, mois-3, 6, 12) ───────
  // encaisse = par mois de paiement · facture/consommation = par mois de génération.
  // Agrège la période courante (`nb` premiers mois) vs période précédente (`nb`
  // mois d'après). Ex: mois-3 → moyennes [0..2] vs [3..5].
  readonly deltaEncaisse = computed<DeltaMois>(() => this.computeDeltaPeriode('encaisse'));
  readonly deltaFacture = computed<DeltaMois>(() => this.computeDeltaPeriode('facture'));
  readonly deltaConso = computed<DeltaMois>(() => this.computeDeltaPeriode('consommation'));

  /** Label de la période courante — évolue selon `periodeNbMois()`.
   *  1 mois → "juillet 2026". 3 mois → "3 derniers mois". 12 mois → "12 derniers mois". */
  readonly moisCourantLabel = computed(() => {
    const nb = this.periodeNbMois();
    const first = this.statsParMois()?.[0];
    if (!first) return this.translate.instant('DASHBOARD.MOIS_ACTUEL');
    const lang = this.translate.currentLang() ?? 'fr';
    if (nb === 1) return formatPeriodeCampagne(first.moisNum, first.annee, lang);
    return this.translate.instant('DASHBOARD.PERIODE.N_DERNIERS_MOIS', { n: nb }, lang);
  });

  /** Label période précédente — mois précédent OU "N mois précédents". */
  readonly moisPrecedentLabel = computed(() => {
    const nb = this.periodeNbMois();
    const lang = this.translate.currentLang() ?? 'fr';
    if (nb === 1) {
      const prev = this.statsParMois()?.[1];
      if (!prev) return '';
      return formatPeriodeCampagne(prev.moisNum, prev.annee, lang);
    }
    return this.translate.instant('DASHBOARD.PERIODE.N_MOIS_PRECEDENTS', { n: nb }, lang);
  });

  // ── COMPTABLE — 3 KPI secondaires ──────────────────────────────────────────
  /** Total et count des impayés (non payés du tout). */
  readonly kpiImpayes = computed(() => {
    const list = this.impayes();
    if (!list) return null;
    const impayes = this.factures()?.filter((f) => f.statut === 'IMPAYEE') ?? [];
    return {
      count: impayes.length,
      total: impayes.reduce((sum, f) => sum + f.montant, 0),
    };
  });

  /** Factures partiellement payées + solde restant. */
  readonly kpiPartielles = computed(() => {
    const list = this.impayes();
    if (!list) return null;
    const partielleIds = new Set(
      this.factures()?.filter((f) => f.statut === 'PARTIELLE').map((f) => f.factureId) ?? [],
    );
    const partielles = list.filter((s) => partielleIds.has(s.factureId));
    return {
      count: partielles.length,
      total: partielles.reduce((sum, s) => sum + s.soldeRestant, 0),
    };
  });

  /** Paiements enregistrés aujourd'hui (comptage + total). */
  readonly kpiAujourdhui = computed(() => {
    const list = this.paiements();
    if (!list) return null;
    const today = new Date().toISOString().slice(0, 10);
    const today_ = list.filter((p) => (p.datePaiement ?? '').startsWith(today));
    return {
      count: today_.length,
      total: today_.reduce((sum, p) => sum + p.montant, 0),
    };
  });

  /** Top 5 impayés les plus anciens — pour la liste sous le héros Comptable. */
  readonly topImpayesAnciens = computed<ImpayeAncien[]>(() => {
    const soldes = this.impayes();
    const fs = this.factures();
    if (!soldes || !fs) return [];
    const factureById = new Map(fs.map((f) => [f.factureId, f]));
    const withMeta: ImpayeAncien[] = soldes
      .map((s) => {
        const f = factureById.get(s.factureId);
        if (!f) return null;
        const jours = this.joursDeRetard(f.dateLimitePaiement) ?? 0;
        return {
          factureId: s.factureId,
          // Chaîne de replis : nom d'abonné → numéro d'abonné → numéro de
          // facture. `?? '—'` laissait passer la chaîne vide et la ligne
          // s'affichait sans identité du tout.
          numeroAbonne: f.abonneNumero || '',
          nom:
            nomAbonneOuReference(f.abonneNom, f.abonneNumero) === '—'
              ? f.numeroFacture
              : nomAbonneOuReference(f.abonneNom, f.abonneNumero),
          jours,
          solde: s.soldeRestant,
        };
      })
      .filter((x): x is ImpayeAncien => x !== null && x.jours > 0);
    return withMeta.sort((a, b) => b.jours - a.jours).slice(0, 5);
  });

  // ── ADMIN — Ribbon 4 KPI cycle ─────────────────────────────────────────────
  // Envois : backend a explicitement livré `statsParMois` SANS champs envois
  // (voir v3.3 : statuts Envoi limités EN_ATTENTE/ENVOYE/ECHEC + pas de
  // campagne_id → scope superviseur impossible sans migration). On reste sur
  // null-first "Indisponible" jusqu'au ticket dédié envois. Le type explicite
  // `RibbonStep | null` sur chaque champ permet au template d'utiliser
  // `@if (ribbonCycle().envois; as r)` correctement (r narrowed en RibbonStep).
  readonly ribbonCycle = computed<{
    releves: RibbonStep | null;
    factures: RibbonStep | null;
    envois: RibbonStep | null;
    paiements: RibbonStep | null;
  }>(() => {
    const cs = this.campagnes();
    const fs = this.factures();
    const ps = this.paiements();
    const enCours = cs?.filter((c) => c.statut === 'EN_COURS') ?? [];
    return {
      releves: cs === null ? null : { count: enCours.length, label: 'CAMP_EN_COURS' },
      factures: fs === null ? null : { count: fs.length, label: 'FACTURES_EMISES' },
      envois: null,
      paiements: ps === null ? null : { count: ps.length, label: 'PAIEMENTS_TOTAL' },
    };
  });

  // ── ADMIN + SUPERVISEUR — Cards campagnes ──────────────────────────────────
  /** Cards campagnes actives (Admin voit toutes, Superviseur voit les siennes). */
  readonly campagnesCards = computed<CampagneCard[]>(() => {
    let cs = this.campagnes() ?? [];
    cs = cs.filter((c) => c.statut === 'EN_COURS' || c.statut === 'PLANIFIEE');
    if (this.isSuperviseur()) {
      const uid = this.auth.user()?.id;
      cs = cs.filter((c) => c.createdBy === uid);
    }
    // On n'a pas la progression exacte sans call par campagne — approximation avec historiqueCampagnes si dispo.
    const histById = new Map(
      (this.stats()?.historiqueCampagnes ?? []).map((h) => [h.campagneId, h]),
    );
    const lang = this.translate.currentLang() ?? 'fr';
    return cs.map((c) => {
      const h = histById.get(c.campagneId);
      return {
        campagneId: c.campagneId,
        nom: formatPeriodeCampagne(c.periodeMois, c.periodeAnnee, lang),
        statut: c.statut,
        pourcentage: h?.pourcentageProgression ?? 0,
        nbReleves: h?.nbReleves ?? 0,
        totalAbonnes: h?.totalAbonnes ?? 0,
      };
    });
  });

  // ── SUPERVISEUR — Cards enrichies avec agents ─────────────────────────────
  /**
   * Cards campagnes du superviseur enrichies avec leurs agents affectés et
   * comptage actif/inactif. Retombe à cards vides sans agents si le chargement
   * a échoué (dégradation gracieuse — la card reste utile).
   */
  readonly superviseurCards = computed<SuperviseurCard[]>(() => {
    const cards = this.campagnesCards();
    const map = this.agentsByCampagne();
    return cards.map((c) => {
      const agents = map.get(c.campagneId) ?? [];
      const inactifs = agents.filter((a) => this.isAgentInactif(a)).length;
      return {
        ...c,
        agents,
        nbAgentsActifs: agents.length - inactifs,
        nbAgentsInactifs: inactifs,
      };
    });
  });

  /** Héros Superviseur : "N campagnes actives · X% moyen relevés". */
  readonly superviseurHero = computed(() => {
    const cards = this.superviseurCards();
    if (cards.length === 0) return null;
    const actives = cards.filter((c) => c.statut === 'EN_COURS');
    const moyenne = actives.length === 0
      ? 0
      : Math.round(actives.reduce((sum, c) => sum + c.pourcentage, 0) / actives.length);
    return {
      nbActives: actives.length,
      nbTotal: cards.length,
      pourcentageMoyen: moyenne,
    };
  });

  // ── SUPERVISEUR — Actions requises (détections réelles) ────────────────────
  readonly actionsSuperviseur = computed<SuperviseurAction[]>(() => {
    const cards = this.superviseurCards();
    const items: SuperviseurAction[] = [];

    // 1. Agents inactifs (>48h sans activité OU statut INACTIF)
    const totalInactifs = cards.reduce((sum, c) => sum + c.nbAgentsInactifs, 0);
    if (totalInactifs > 0) {
      items.push({
        key: 'agents-inactifs',
        labelKey: 'DASHBOARD.ACTIONS.AGENTS_INACTIFS',
        params: { count: totalInactifs },
        severity: 'warning',
      });
    }

    // 2. Campagnes prêtes à démarrer (PLANIFIEE, jamais commencées)
    const attente = cards.filter((c) => c.statut === 'PLANIFIEE').length;
    if (attente > 0) {
      items.push({
        key: 'attente-demarrage',
        labelKey: 'DASHBOARD.ACTIONS.ATTENTE_DEMARRAGE',
        params: { count: attente },
        severity: 'info',
      });
    }

    // 3. Campagnes en retard (>20 jours depuis datePlanifiee, statut EN_COURS)
    const cs = this.campagnes() ?? [];
    const uid = this.auth.user()?.id;
    const now = Date.now();
    const retard = cs.filter((c) => {
      if (this.isSuperviseur() && c.createdBy !== uid) return false;
      if (c.statut !== 'EN_COURS' || !c.datePlanifiee) return false;
      const planned = new Date(c.datePlanifiee).getTime();
      return !Number.isNaN(planned) && (now - planned) > 20 * 86_400_000;
    }).length;
    if (retard > 0) {
      items.push({
        key: 'campagnes-retard',
        labelKey: 'DASHBOARD.ACTIONS.CAMPAGNES_RETARD',
        params: { count: retard },
        severity: 'danger',
      });
    }

    // 4. Campagnes prêtes à clôturer (EN_COURS + 100% de progression)
    const pretes = cards.filter((c) => c.statut === 'EN_COURS' && c.pourcentage >= 100).length;
    if (pretes > 0) {
      items.push({
        key: 'campagnes-pretes-cloture',
        labelKey: 'DASHBOARD.ACTIONS.CAMPAGNES_PRETES_CLOTURE',
        params: { count: pretes },
        severity: 'info',
      });
    }

    // Tri par sévérité DESC (danger > warning > info) — l'urgent en premier
    // Fix v4 P3 : sans ce sort, un danger apparaissait après des infos ajoutés
    // avant lui dans le code (contre-intuitif).
    const rank: Record<SuperviseurAction['severity'], number> = { danger: 3, warning: 2, info: 1 };
    items.sort((a, b) => rank[b.severity] - rank[a.severity]);

    return items;
  });

  /**
   * État positif "Tout est à jour" pour la vue Superviseur — quand aucune
   * action requise et qu'il y a au moins une campagne. Fix v4 P2 : sans ça,
   * le superviseur qui vient de résoudre ses 4 actions voit la section
   * disparaître, sensation "perte de contexte" au lieu de "félicitations".
   * Utilise la Règle du Vert Rare (quand quelque chose devient vrai).
   */
  readonly showSuperviseurToutAJour = computed(() =>
    this.isSuperviseur()
    && this.actionsSuperviseur().length === 0
    && this.superviseurCards().length > 0,
  );

  /**
   * Empty Comptable pour tenant vierge — Fix v4 P3 : distinct du emptyGlobal
   * (qui ne se déclenche que si 0 factures). Un Comptable arrivant sur tenant
   * avec factures mais 0 paiement voit 0 FCFA en héros = anticlimatique. On
   * détecte cet état et propose CTA "Enregistrer un paiement".
   */
  readonly emptyComptable = computed(() => {
    if (!this.isComptable()) return false;
    const parMois = this.statsParMois();
    if (!parMois || parMois.length === 0) return false;
    return parMois.every((m) => m.encaisse === 0);
  });

  /** Un agent est considéré inactif : statut INACTIF explicite OU pas d'activité depuis 48h. */
  private isAgentInactif(a: AgentAffecte): boolean {
    if (a.statut === 'INACTIF') return true;
    if (!a.derniereActivite) return false;
    const last = new Date(a.derniereActivite).getTime();
    if (Number.isNaN(last)) return false;
    return (Date.now() - last) > 48 * 3600 * 1000;
  }

  // ── Empty states ────────────────────────────────────────────────────────────
  readonly emptyGlobal = computed(() =>
    this.stats() !== null &&
    this.stats()?.montantTotalFactureGlobal === 0 &&
    (this.factures()?.length ?? 0) === 0,
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const res = await this.service.loadAll();
    this.stats.set(res.stats);
    this.statsParMois.set(res.statsParMois);
    this.campagnes.set(res.campagnes);
    this.impayes.set(res.impayes);
    this.paiements.set(res.paiements);
    this.factures.set(res.factures);
    // Superviseur : enrichit ses campagnes avec les agents (parallèle),
    // dégradation gracieuse si un fetch d'agents échoue (map vide).
    if (this.isSuperviseur()) {
      const uid = this.auth.user()?.id;
      const mine = (res.campagnes ?? []).filter((c) => c.createdBy === uid);
      const map = await this.service.loadAgentsByCampagne(mine.map((c) => c.campagneId));
      this.agentsByCampagne.set(map);
    }
    this.loading.set(false);
  }

  /**
   * Retry vraiment ciblé — recharge UNE seule source (les autres restent
   * intactes dans le cache service). Sette uniquement le signal correspondant.
   * Fix v3 P1 : la version précédente faisait `reloadSource` puis `loadAll`,
   * soit 2 loadAll séquentiels. Ici on ne touche qu'à la source demandée.
   */
  async retrySource(source: 'stats' | 'statsParMois' | 'campagnes' | 'impayes' | 'paiements' | 'factures'): Promise<void> {
    const res = await this.service.reloadSource(source);
    switch (source) {
      case 'stats': this.stats.set(res.stats); break;
      case 'statsParMois': this.statsParMois.set(res.statsParMois); break;
      case 'campagnes': this.campagnes.set(res.campagnes); break;
      case 'impayes': this.impayes.set(res.impayes); break;
      case 'paiements': this.paiements.set(res.paiements); break;
      case 'factures': this.factures.set(res.factures); break;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private joursDeRetard(dateLimite?: string): number | undefined {
    if (!dateLimite) return undefined;
    const limite = new Date(dateLimite).getTime();
    if (Number.isNaN(limite)) return undefined;
    const jours = Math.floor((Date.now() - limite) / 86_400_000);
    return jours >= 0 ? jours : undefined;
  }

  /**
   * Montant SANS suffixe : le gabarit pose lui-même « FCFA » en petit à côté
   * du chiffre. Renvoyer l'unité ici produisait « 138 000 FCFA FCFA ».
   */
  formatFCFA(n: number): string { return (n ?? 0).toLocaleString('fr-FR'); }

  /**
   * Formate un nombre sans suffixe monétaire — usage sur les KPI dont
   * l'unité n'est PAS FCFA (m³ dans le héros Admin, count des KPI).
   * Corrige le bug shipped v3 "45 234 FCFA m³" sur le Chiffre Fort m³.
   */
  formatNumber(n: number): string {
    const lang = this.translate.currentLang() ?? 'fr';
    return Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR');
  }

  /** Signe formaté pour delta ("+12%" ou "-8%" ou "≈ 0%"). */
  formatDelta(pct: number | null): string {
    if (pct === null) return '';
    const abs = Math.abs(pct);
    if (abs < 0.5) return '≈ 0%';
    const sign = pct > 0 ? '+' : '−';
    return `${sign}${abs.toFixed(0)}%`;
  }

  /** Classe CSS delta pour tint Vert/Rouge/Neutre.
   * Fix v4 P3 : la branche `pct === null` était code mort — le template
   * n'affichait jamais la classe pour null (`@if d.deltaPct !== null`).
   */
  deltaClass(pct: number | null): string {
    if (pct === null || Math.abs(pct) < 0.5) return 'dash-delta--neutre';
    return pct > 0 ? 'dash-delta--up' : 'dash-delta--down';
  }
}
