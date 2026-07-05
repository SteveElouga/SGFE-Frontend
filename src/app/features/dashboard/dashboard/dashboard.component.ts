import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { GET_STATS_GLOBALES } from '../../../graphql/queries/stats.queries';
import { GET_CAMPAGNE_ACTIVE } from '../../../graphql/queries/campagnes.queries';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';

interface HistCampagne {
  campagneId: string;
  nomCampagne: string;
  totalAbonnes: number;
  nbReleves: number;
  pourcentageProgression: number;
  consommationTotale: number;
}

interface StatsGlobales {
  consommationTotaleGlobale: number;
  montantTotalFactureGlobal: number;
  montantTotalEncaisseGlobal: number;
  historiqueCampagnes: HistCampagne[];
}

interface CampagneEnCours {
  nom: string;
  nbReleves: number;
  totalAbonnes: number;
  pourcentage: number;
}

interface ImpayesResume {
  total: number;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DecimalPipe, TranslatePipe, PageTopbarComponent],
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
    const [stats, enCours, impayes] = await Promise.all([
      this.loadStats(),
      this.loadCampagneEnCours(),
      this.loadImpayes(),
    ]);
    this.stats.set(stats);
    this.campagneEnCours.set(enCours);
    this.impayes.set(impayes);
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
        pourcentage: Math.round(p.pourcentage),
      };
    } catch {
      return null;
    }
  }

  /** Impayés actifs — `null` si indisponible. */
  private async loadImpayes(): Promise<ImpayesResume | null> {
    try {
      const impayes = await this.facturesService.getImpayes();
      return {
        total: impayes.reduce((sum, i) => sum + (i.soldeRestant ?? 0), 0),
        count: impayes.length,
      };
    } catch {
      return null;
    }
  }

  formatFCFA(n: number): string {
    return Math.round(n).toLocaleString('fr-FR');
  }

  formatM3(n: number): string {
    return `${Math.round(n).toLocaleString('fr-FR')} m³`;
  }
}
