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
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { GET_STATS_GLOBALES } from '../../../graphql/queries/stats.queries';
import { GET_CAMPAGNE_ACTIVE } from '../../../graphql/queries/campagnes.queries';
import { Campagne, formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';

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

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DecimalPipe, TranslatePipe, PageTopbarComponent, ErrorBannerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly campagnesService = inject(CampagnesService);
  private readonly facturesService = inject(FacturesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  readonly user = this.auth.user;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly stats = signal<StatsGlobales | null>(null);
  readonly campagneEnCours = signal<CampagneEnCours | null>(null);
  readonly impayesTotal = signal(0);
  readonly impayesCount = signal(0);

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
    this.error.set(null);
    try {
      const [stats, enCours, impayes] = await Promise.all([
        this.loadStats(),
        this.loadCampagneEnCours(),
        this.loadImpayes(),
      ]);
      this.stats.set(stats);
      this.campagneEnCours.set(enCours);
      this.impayesTotal.set(impayes.total);
      this.impayesCount.set(impayes.count);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('DASHBOARD.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStats(): Promise<StatsGlobales> {
    const res = await firstValueFrom(
      this.apollo.query<{ statsGlobales: StatsGlobales }>({
        query: GET_STATS_GLOBALES,
        fetchPolicy: 'network-only',
      }),
    );
    return res.data!.statsGlobales;
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

  private async loadImpayes(): Promise<{ total: number; count: number }> {
    try {
      const impayes = await this.facturesService.getImpayes();
      return {
        total: impayes.reduce((sum, i) => sum + (i.soldeRestant ?? 0), 0),
        count: impayes.length,
      };
    } catch {
      return { total: 0, count: 0 };
    }
  }

  formatFCFA(n: number): string {
    return Math.round(n).toLocaleString('fr-FR');
  }

  formatM3(n: number): string {
    return `${Math.round(n).toLocaleString('fr-FR')} m³`;
  }
}
