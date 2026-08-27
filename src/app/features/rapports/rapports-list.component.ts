import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { ExportsService } from '../../core/rapports/exports.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { GET_STATS_GLOBALES } from '../../graphql/queries/stats.queries';
import { FcfaPipe } from '../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../shared/services/toast.service';

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

@Component({
  selector: 'app-rapports-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DecimalPipe, SelectModule, PageTopbarComponent, ErrorBannerComponent, FcfaPipe],
  templateUrl: './rapports-list.component.html',
  styleUrl: './rapports-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RapportsListComponent implements OnInit {
  /**
   * Le service reporting tient sa propre copie des campagnes et renvoie des
   * lignes distinctes sous un même nom — deux « Août 2026 », deux
   * « Facturation Juillet 2026 ». Le frontend ne peut pas les renommer ; il
   * peut au moins cesser de les rendre indiscernables, en suffixant les seuls
   * noms ambigus des premiers caractères de leur identifiant.
   *
   * La divergence elle-même est un écart de données entre services : deux des
   * campagnes listées ici n'existent pas dans le service campagne.
   */
  protected libelleCampagne(h: { campagneId: string; nomCampagne: string }): string {
    const homonymes = (this.stats()?.historiqueCampagnes ?? []).filter(
      (x) => x.nomCampagne === h.nomCampagne,
    ).length;
    return homonymes > 1 ? `${h.nomCampagne} · ${h.campagneId.slice(0, 6)}` : h.nomCampagne;
  }

  private readonly apollo = inject(Apollo);
  private readonly exports = inject(ExportsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly stats = signal<StatsGlobales | null>(null);
  /** Identifiant de l'export en cours ('factures' | 'paiements' | 'synthese' | 'bilan'). */
  readonly exporting = signal<string | null>(null);
  /** Campagne ciblée par les 3 exports par-campagne (le bilan impayés est global). */
  readonly selectedCampagneId = signal<string | null>(null);

  readonly tauxRecouvrement = computed(() => {
    const s = this.stats();
    if (!s || s.montantTotalFactureGlobal <= 0) return 0;
    return Math.round((s.montantTotalEncaisseGlobal / s.montantTotalFactureGlobal) * 100);
  });

  readonly campagneOptions = computed(() =>
    (this.stats()?.historiqueCampagnes ?? []).map((h) => ({
      label: this.libelleCampagne(h),
      value: h.campagneId,
    })),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.apollo.query<{ statsGlobales: StatsGlobales }>({
          query: GET_STATS_GLOBALES,
          fetchPolicy: 'network-only',
        }),
      );
      const stats = res.data!.statsGlobales;
      this.stats.set(stats);
      // Présélection de la campagne la plus récente pour les exports par-campagne.
      if (!this.selectedCampagneId() && stats.historiqueCampagnes.length > 0) {
        this.selectedCampagneId.set(stats.historiqueCampagnes[0].campagneId);
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('RAPPORTS.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Exports serveur (écran 13) ──────────────────────────────────────────────

  exportFactures(): void {
    const id = this.selectedCampagneId();
    if (id) void this.run('factures', () => this.exports.facturesCsv(id));
  }

  exportPaiements(): void {
    const id = this.selectedCampagneId();
    if (id) void this.run('paiements', () => this.exports.paiementsCsv(id));
  }

  exportSynthese(): void {
    const id = this.selectedCampagneId();
    if (id) void this.run('synthese', () => this.exports.synthesePdf(id));
  }

  exportBilan(): void {
    void this.run('bilan', () => this.exports.bilanImpayesPdf());
  }

  private async run(id: string, action: () => Promise<void>): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(id);
    try {
      await action();
      this.toast.success(this.translate.instant('RAPPORTS.EXPORT_DONE'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : this.translate.instant('ERRORS.GENERIC');
      this.toast.error(message);
    } finally {
      this.exporting.set(null);
    }
  }

  formatM3(n: number): string {
    return `${Math.round(n).toLocaleString('fr-FR')} m³`;
  }
}
