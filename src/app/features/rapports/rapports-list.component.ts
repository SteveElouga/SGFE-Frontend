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
import { InputTextModule } from 'primeng/inputtext';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { CriteresExport, ExportsService } from '../../core/rapports/exports.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { GET_STATS_GLOBALES } from '../../graphql/queries/stats.queries';
import { CampagnesService } from '../../core/campagnes/campagnes.service';
import { nomCampagneAffichable } from '../../shared/utils/campagne.utils';
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
  imports: [
    FormsModule,
    TranslatePipe,
    DecimalPipe,
    SelectModule,
    InputTextModule,
    PageTopbarComponent,
    ErrorBannerComponent,
    FcfaPipe,
  ],
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
    return nomCampagneAffichable({
      nom: h.nomCampagne,
      // `StatsCampagne` ne porte pas de date : on la cherche dans la liste des
      // campagnes réelles. Absente = la campagne n'existe plus côté Campagne,
      // et le repli sur l'identifiant dit précisément cela.
      dateCreation: this.datesCampagnes().get(h.campagneId) ?? null,
      nbHomonymes: homonymes,
      lang: this.translate.currentLang() ?? 'fr',
      replisurId: h.campagneId,
    });
  }

  /** Date de création par identifiant, pour désambiguïser les homonymes. */
  private readonly datesCampagnes = signal<Map<string, string>>(new Map());

  private async loadDatesCampagnes(): Promise<void> {
    try {
      const campagnes = await this.campagnesService.getCampagnes();
      this.datesCampagnes.set(
        new Map(campagnes.filter((c) => c.dateCreation).map((c) => [c.campagneId, c.dateCreation!])),
      );
    } catch {
      // Non bloquant : sans les dates, on retombe sur le fragment d'identifiant.
    }
  }

  private readonly apollo = inject(Apollo);
  private readonly exports = inject(ExportsService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly stats = signal<StatsGlobales | null>(null);
  /** Identifiant de l'export en cours ('factures' | 'paiements' | 'synthese' | 'bilan'). */
  readonly exporting = signal<string | null>(null);
  /** Campagne ciblée par la synthèse PDF, et par les CSV en mode « campagne ». */
  readonly selectedCampagneId = signal<string | null>(null);

  // ── Exports CSV : par campagne, ou par période ─────────────────────────────
  //
  // Le serveur exigeait un `campagne_id`. Un comptable qui voulait son journal
  // du mois devait donc exporter campagne par campagne et recoller les fichiers
  // à la main — et les régularisations, créées sans campagne, n'apparaissaient
  // dans aucun export. Les deux critères sont maintenant offerts ici.
  //
  // La synthèse PDF et le bilan des impayés ne changent pas : le premier est par
  // nature une synthèse DE campagne, le second est déjà global.
  readonly modeExport = signal<'campagne' | 'periode'>('campagne');
  readonly dateDebut = signal('');
  readonly dateFin = signal('');

  /** Bornes inversées : refusé côté serveur, autant le dire avant l'appel. */
  readonly periodeInvalide = computed(() => {
    const d = this.dateDebut();
    const f = this.dateFin();
    return !!d && !!f && d > f;
  });

  /** Les critères tels qu'ils partiront — une seule source pour les deux CSV. */
  readonly criteresExport = computed<CriteresExport>(() =>
    this.modeExport() === 'campagne'
      ? { campagneId: this.selectedCampagneId() ?? '' }
      : { dateDebut: this.dateDebut(), dateFin: this.dateFin() },
  );

  /** Un export CSV est-il lançable ? */
  readonly csvPret = computed(() =>
    this.modeExport() === 'campagne' ? !!this.selectedCampagneId() : !this.periodeInvalide(),
  );

  /**
   * Ce que l'export va contenir, en clair sous le bouton.
   *
   * Aucune borne est un critère valide — c'est ce qu'une clôture d'exercice
   * demande — mais un bouton qui rend tout l'historique sans le dire est un
   * bouton qu'on ne clique pas deux fois. Il le dit.
   */
  readonly libelleCritere = computed(() => {
    if (this.modeExport() === 'campagne') return this.translate.instant('RAPPORTS.PAR_CAMPAGNE');
    const d = this.dateDebut();
    const f = this.dateFin();
    if (d && f) return `${d} → ${f}`;
    if (d) return this.translate.instant('RAPPORTS.PERIODE_DEPUIS', { debut: d });
    if (f) return this.translate.instant('RAPPORTS.PERIODE_JUSQU', { fin: f });
    return this.translate.instant('RAPPORTS.TOUT_HISTORIQUE');
  });

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
    void this.loadDatesCampagnes();
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
    if (!this.csvPret()) return;
    const criteres = this.criteresExport();
    void this.run('factures', () => this.exports.facturesCsv(criteres));
  }

  exportPaiements(): void {
    if (!this.csvPret()) return;
    const criteres = this.criteresExport();
    void this.run('paiements', () => this.exports.paiementsCsv(criteres));
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
