import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AgentAffecte, ZoneRepartition } from '../../../../shared/models/campagne.model';

/**
 * Section « Agents affectés » (cartes) + « Répartition par zone » (table
 * desktop / cartes mobile) de la fiche campagne.
 *
 * Les deux vivent dans un seul composant : elles partagent la même source
 * (`repartData`) et la même classe `.zone-prog` pour leur barre de
 * progression. La répartition par zone n'est PAS soumise à
 * `canActOnCampagne` dans l'écran d'origine (un AGENT peut la voir si les
 * données sont chargées) — seule la grille de cartes agents l'est ; ce
 * composant reproduit exactement cette asymétrie via l'input dédié.
 */
@Component({
  selector: 'app-agents-panel',
  imports: [LowerCasePipe, TranslatePipe],
  templateUrl: './agents-panel.component.html',
  styleUrl: './agents-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentsPanelComponent {
  private readonly translate = inject(TranslateService);

  readonly agentsData = input<AgentAffecte[]>([]);
  readonly repartData = input<ZoneRepartition[]>([]);
  /** Gate uniquement la grille de cartes agents — pas la répartition par zone. */
  readonly canActOnCampagne = input(false);

  /** Ouvrir la feuille d'affectation d'agents (gérée par le parent). */
  readonly addAgent = output<void>();
  /** Ouvrir la feuille de zones pour un agent donné (gérée par le parent). */
  readonly editZones = output<{ id: string; username: string }>();

  // Cartes « Agents affectés » — alimentées par la query `agentsCampagne`
  // (total abonnés par agent dérivé de la répartition par zone).
  readonly agentsAffectes = computed(() => {
    const repart = this.repartData();
    return this.agentsData().map((a) => {
      const total = repart
        .filter((z) => z.agentId === a.agentId)
        .reduce((s, z) => s + (z.nbAbonnes ?? 0), 0);
      const done = a.nbReleves ?? 0;
      const zones = (a.zones ?? []).map((z) => ({ nom: z.quartier, camp: z.camp }));
      return {
        id: a.agentId,
        username: a.username,
        initials: this.agentInitials(a.username),
        statut: a.statut,
        zonesGroupees: this.grouperZonesParQuartier(zones),
        nbReleves: done,
        nbAbonnes: total,
        pct: total ? Math.round((done / total) * 100) : 0,
        syncLe: a.derniereActivite,
      };
    });
  });

  private agentInitials(username: string): string {
    const parts = username.split(/[._\- ]/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2);
    return s.toUpperCase();
  }

  /**
   * Un agent avec 5 camps dans le même quartier affichait 5 pastilles
   * identiques hormis un chiffre (« Bastos · 1 », « Bastos · 5 »...). Une
   * pastille par quartier, ses camps listés ensemble (« Bastos · 1, 5 »),
   * porte la même information en une fraction de l'espace.
   */
  private grouperZonesParQuartier(
    zones: { nom: string; camp: number | null }[],
  ): { nom: string; camps: (number | null)[] }[] {
    const parCamp = new Map<string, (number | null)[]>();
    for (const z of zones) {
      const camps = parCamp.get(z.nom);
      if (camps) camps.push(z.camp);
      else parCamp.set(z.nom, [z.camp]);
    }
    return [...parCamp.entries()].map(([nom, camps]) => ({ nom, camps }));
  }

  // ── Repli des zones d'un agent au-delà de zonesVisibles (carte agent) ────
  protected readonly zonesVisibles = 6;
  private readonly agentsZonesEtendues = signal<ReadonlySet<string>>(new Set());

  agentZonesEstEtendu(agentId: string): boolean {
    return this.agentsZonesEtendues().has(agentId);
  }

  basculerAgentZones(agentId: string): void {
    const next = new Set(this.agentsZonesEtendues());
    if (next.has(agentId)) next.delete(agentId);
    else next.add(agentId);
    this.agentsZonesEtendues.set(next);
  }

  // Statut de tournée : le backend renvoie une chaîne libre → normalisation
  // tolérante (variantes de casse/format).
  agentStatutClass(statut: string | null): string {
    const s = (statut ?? '').toUpperCase();
    if (s.includes('TOURN')) return 'agent-statut--tournee';
    if (s.includes('RETARD')) return 'agent-statut--retard';
    if (s.includes('ACTIF') || s.includes('ACTIVE')) return 'agent-statut--actif';
    return 'agent-statut--inactif';
  }

  agentStatutLabel(statut: string | null): string {
    const s = (statut ?? '').toUpperCase();
    let key: string | null = null;
    if (s.includes('TOURN')) key = 'EN_TOURNEE';
    else if (s.includes('RETARD')) key = 'EN_RETARD';
    else if (s.includes('ACTIF') || s.includes('ACTIVE')) key = 'ACTIF';
    else if (!s || s.includes('INACTIF')) key = 'INACTIF';
    return key ? this.translate.instant(`CAMPAGNES.AGENT_STATUT.${key}`) : (statut ?? '');
  }

  agentSyncLabel(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const lang = this.translate.currentLang() ?? undefined;
    const min = Math.floor(diff / 60000);
    if (min < 1) return this.translate.instant('CAMPAGNES.SYNC_NOW', {}, lang);
    if (min < 60) return this.translate.instant('CAMPAGNES.SYNC_MIN', { n: min }, lang);
    const h = Math.floor(min / 60);
    if (h < 24) return this.translate.instant('CAMPAGNES.SYNC_HOUR', { n: h }, lang);
    return this.translate.instant('CAMPAGNES.SYNC_DAY', { n: Math.floor(h / 24) }, lang);
  }

  // Répartition par zone — query backend `repartitionParZone` (inclut l'agent).
  readonly repartitionZones = computed(() =>
    this.repartData().map((z) => ({
      key: `${z.quartier}·${z.camp ?? '—'}·${z.agentId ?? ''}`,
      quartier: z.quartier,
      camp: z.camp,
      agentUsername: z.agentUsername,
      agentInitials: z.agentUsername ? this.agentInitials(z.agentUsername) : null,
      abonnes: z.nbAbonnes,
      releves: z.nbReleves,
      pct: Math.round(z.pct ?? 0),
    })),
  );
}
