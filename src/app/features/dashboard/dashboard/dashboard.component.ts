import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { GET_STATS_GLOBALES } from '../../../graphql/queries/stats.queries';
import { GET_CAMPAGNE_ACTIVE } from '../../../graphql/queries/campagnes.queries';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { Paiement, SoldeFacture } from '../../../shared/models/facture.model';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';

interface StatsGlobales {
  consommationTotaleGlobale: number;
  montantTotalFactureGlobal: number;
  montantTotalEncaisseGlobal: number;
}

interface CampagneEnCours {
  nom: string;
  nbReleves: number;
  totalAbonnes: number;
  nonReleves: number;
  pourcentage: number;
}

interface ImpayesResume {
  total: number;
  count: number;
}

interface ActiviteItem {
  type: 'paiement' | 'impaye';
  montant: number;
  date?: string;
  mode?: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe, PageTopbarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly campagnesService = inject(CampagnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  /**
   * Chaque source se charge indépendamment (`null` = indisponible) : un service
   * en panne (ex. Reporting → `SERVICE_UNAVAILABLE`) dégrade sa carte sans
   * casser le reste du tableau de bord.
   */
  readonly stats = signal<StatsGlobales | null>(null);
  readonly campagneEnCours = signal<CampagneEnCours | null>(null);
  readonly impayes = signal<ImpayesResume | null>(null);
  readonly activite = signal<ActiviteItem[] | null>(null);

  /** Taux de recouvrement global (encaissé / facturé). */
  readonly tauxRecouvrement = computed(() => {
    const s = this.stats();
    if (!s || s.montantTotalFactureGlobal <= 0) return 0;
    return Math.round((s.montantTotalEncaisseGlobal / s.montantTotalFactureGlobal) * 100);
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const [stats, enCours, impayes, paiements] = await Promise.all([
      this.loadStats(),
      this.loadCampagneEnCours(),
      this.loadImpayes(),
      this.loadPaiements(),
    ]);
    this.stats.set(stats);
    this.campagneEnCours.set(enCours);
    this.impayes.set(
      impayes ? { total: impayes.reduce((sum, i) => sum + (i.soldeRestant ?? 0), 0), count: impayes.length } : null,
    );
    this.activite.set(this.buildActivite(paiements, impayes));
    this.loading.set(false);
  }

  /** Agrégats globaux — `null` si le service Reporting est indisponible. */
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
    } catch {
      return null;
    }
  }

  /** Campagne EN_COURS + sa progression (même approche que la sidebar). */
  private async loadCampagneEnCours(): Promise<CampagneEnCours | null> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<{ campagnes: Campagne[] }>({
          query: GET_CAMPAGNE_ACTIVE,
          context: { silentError: true },
        }),
      );
      const enCours = res.data?.campagnes?.find((c) => c.statut === 'EN_COURS');
      if (!enCours) return null;
      const p = await this.campagnesService.getProgression(enCours.campagneId);
      const lang = this.translate.currentLang() ?? 'fr';
      return {
        nom: formatPeriodeCampagne(enCours.periodeMois, enCours.periodeAnnee, lang),
        nbReleves: p.nbReleves,
        totalAbonnes: p.totalAbonnes,
        nonReleves: p.nbEnAttente,
        pourcentage: Math.round(p.pourcentage),
      };
    } catch {
      return null;
    }
  }

  private async loadImpayes(): Promise<SoldeFacture[] | null> {
    try {
      return await this.facturesService.getImpayes();
    } catch {
      return null;
    }
  }

  private async loadPaiements(): Promise<Paiement[] | null> {
    try {
      return await this.facturesService.getAllPaiements();
    } catch {
      return null;
    }
  }

  /**
   * Activité récente = derniers paiements (verts) + impayés à recouvrer (rouges).
   * `null` seulement si les deux sources sont indisponibles.
   */
  private buildActivite(paiements: Paiement[] | null, impayes: SoldeFacture[] | null): ActiviteItem[] | null {
    if (paiements === null && impayes === null) return null;
    const items: ActiviteItem[] = [];

    for (const p of [...(paiements ?? [])]
      .sort((a, b) => (b.datePaiement ?? '').localeCompare(a.datePaiement ?? ''))
      .slice(0, 4)) {
      items.push({ type: 'paiement', montant: p.montant, date: p.datePaiement, mode: p.modePaiement });
    }

    for (const i of [...(impayes ?? [])]
      .sort((a, b) => b.soldeRestant - a.soldeRestant)
      .slice(0, 3)) {
      items.push({ type: 'impaye', montant: i.soldeRestant });
    }

    return items;
  }

  /** Temps relatif localisé (« il y a 5 min » / « 5 min ago »). */
  relativeTime(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const lang = this.translate.currentLang() ?? 'fr';
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const mins = Math.round((then - Date.now()) / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
  }

  formatFCFA(n: number): string {
    return Math.round(n).toLocaleString('fr-FR');
  }

  formatM3(n: number): string {
    return `${Math.round(n).toLocaleString('fr-FR')} m³`;
  }
}
