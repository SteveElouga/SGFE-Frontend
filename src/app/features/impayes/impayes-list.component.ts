import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { SoldeFacture, StatutFacture, SuiviImpaye } from '../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { ToastService } from '../../shared/services/toast.service';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../shared/components/filters-panel/filters-panel.component';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table/data-table.component';
import {
  DataTableCardDirective,
  DataTableCellDirective,
} from '../../shared/components/data-table/data-table.directives';
import { GET_ABONNES } from '../../graphql/queries/abonnes.queries';
import { formatFcfa } from '../../shared/pipes/fcfa.pipe';

/** Fenêtre de pause des relances après réception d'un acompte (EF-IMP). */
const PAUSE_ACOMPTE_JOURS = 5;

/** État visuel du badge d'étape de relance. */
type BadgeState = 'etape1' | 'etape2' | 'etape3' | 'suspendue' | 'pause' | 'unknown';

interface AbonneRef {
  id: string;
  numeroAbonne: string;
  nom: string;
  prenom: string;
}

interface ImpayeRow {
  factureId: string;
  abonneId: string | null;
  abonneNom: string;
  numeroAbonne: string;
  numeroFacture: string;
  montantTotal: number;
  montantPaye: number;
  soldeRestant: number;
  statut: StatutFacture;
  etapeActuelle: number | null;
  dateDepassement: string | null;
  retardJours: number | null;
  enPause: boolean;
}

@Component({
  imports: [
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FiltersPanelComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
  ],
  templateUrl: './impayes-list.component.html',
  styleUrl: './impayes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpayesListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly apollo = inject(Apollo);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly impayes = signal<ImpayeRow[]>([]);

  readonly searchTerm = signal('');
  readonly filtreEtape = signal<number | 'TOUS'>('TOUS');
  readonly tri = signal<'ANCIENNETE' | 'SOLDE'>('ANCIENNETE');

  readonly columns: DataTableColumn[] = [
    { key: 'abonne', header: 'IMPAYES.COL_ABONNE', sortable: true, sortValue: (r) => (r as ImpayeRow).abonneNom },
    { key: 'montant', header: 'IMPAYES.COL_MONTANT', sortable: true, sortValue: (r) => (r as ImpayeRow).montantTotal },
    { key: 'paye', header: 'IMPAYES.COL_PAYE', sortable: true, sortValue: (r) => (r as ImpayeRow).montantPaye },
    { key: 'solde', header: 'IMPAYES.COL_SOLDE', sortable: true, sortValue: (r) => (r as ImpayeRow).soldeRestant },
    { key: 'retard', header: 'IMPAYES.COL_RETARD', sortable: true, sortValue: (r) => (r as ImpayeRow).retardJours ?? 0 },
    { key: 'etape', header: 'IMPAYES.COL_ETAPE', sortable: true, sortValue: (r) => (r as ImpayeRow).etapeActuelle ?? 0 },
    { key: 'actions', header: 'IMPAYES.COL_ACTIONS' },
  ];

  /** Filtres unifiés (batch 10). Étape en auto (4 options → chips mobile, select
   *  desktop). Tri : select séparé car sémantique différente (ordre != filtre). */
  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const all = this.impayes();
    return [
      {
        key: 'etape',
        label: 'IMPAYES.COL_ETAPE',
        options: [1, 2, 3, 4].map((n) => ({
          label: this.translate.instant('IMPAYES.CHIP_ETAPE', { n }, lang),
          value: String(n),
          count: all.filter((i) => i.etapeActuelle === n).length,
        })),
      },
      {
        key: 'tri',
        label: 'IMPAYES.TRI_LABEL',
        options: [
          { label: this.translate.instant('IMPAYES.TRI_ANCIENNETE', {}, lang), value: 'ANCIENNETE' },
          { label: this.translate.instant('IMPAYES.TRI_SOLDE', {}, lang), value: 'SOLDE' },
        ],
        render: 'select',
        clearable: false,   // tri doit toujours avoir une valeur
      },
    ];
  });

  readonly filterValues = computed<FilterValues>(() => ({
    etape: this.filtreEtape() === 'TOUS' ? null : String(this.filtreEtape()),
    tri: this.tri(),
  }));

  onFiltersChange(v: FilterValues): void {
    const etape = v['etape'] === null ? 'TOUS' : (Number(v['etape']) as number);
    if (etape !== this.filtreEtape()) this.filtreEtape.set(etape);
    const tri = (v['tri'] as 'ANCIENNETE' | 'SOLDE' | null) ?? 'ANCIENNETE';
    if (tri !== this.tri()) this.tri.set(tri);
  }

  readonly impayesFiltres = computed(() => {
    const etape = this.filtreEtape();
    const term = this.searchTerm().trim().toLowerCase();
    const tri = this.tri();

    let list = this.impayes();

    if (etape !== 'TOUS') {
      list = list.filter((i) => i.etapeActuelle === etape);
    }
    if (term) {
      list = list.filter(
        (i) =>
          i.abonneNom.toLowerCase().includes(term) ||
          i.numeroAbonne.toLowerCase().includes(term) ||
          i.numeroFacture.toLowerCase().includes(term),
      );
    }

    return [...list].sort((a, b) => {
      if (tri === 'SOLDE') return b.soldeRestant - a.soldeRestant;
      return (b.retardJours ?? -1) - (a.retardJours ?? -1);
    });
  });

  // ── KPI (calculés sur l'ensemble, pas la vue filtrée) ─────────────────────
  readonly nbImpayes = computed(() => this.impayes().length);
  readonly totalSolde = computed(() =>
    this.impayes().reduce((acc, i) => acc + i.soldeRestant, 0),
  );
  readonly nbEtape3Plus = computed(
    () => this.impayes().filter((i) => (i.etapeActuelle ?? 0) >= 3).length,
  );
  readonly nbSuspendues = computed(
    () => this.impayes().filter((i) => i.etapeActuelle === 4).length,
  );

  readonly subtitle = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant(
      'IMPAYES.SUBTITLE_FULL',
      { count: this.nbImpayes(), solde: formatFcfa(this.totalSolde()) },
      lang,
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [soldes, factures, abonnesRes, paiements] = await Promise.all([
        this.service.getImpayes(),
        this.service.getFactures(),
        firstValueFrom(
          this.apollo.query<{ abonnes: AbonneRef[] }>({
            query: GET_ABONNES,
            fetchPolicy: 'cache-first',
          }),
        ),
        this.service.getAllPaiements(),
      ]);

      const abonnesMap = new Map<string, AbonneRef>();
      for (const a of abonnesRes.data?.abonnes ?? []) abonnesMap.set(a.id, a);

      const facturesMap = new Map(factures.map((f) => [f.factureId, f]));

      // Date du dernier paiement par facture → détecte la pause post-acompte.
      const dernierPaiement = new Map<string, string>();
      for (const p of paiements) {
        const prev = dernierPaiement.get(p.factureId);
        if (!prev || p.datePaiement > prev) dernierPaiement.set(p.factureId, p.datePaiement);
      }

      // Ligne de base (sans suivi encore) : affichage immédiat.
      const baseRows = soldes.map((s) =>
        this.toRow(s, facturesMap, abonnesMap, dernierPaiement, null),
      );
      this.impayes.set(baseRows);

      // Enrichissement par le suivi (étape + date de dépassement).
      const suivis = await Promise.allSettled(
        soldes.map((s) => this.service.getSuiviImpaye(s.factureId)),
      );
      const enriched = soldes.map((s, i) => {
        const res = suivis[i];
        const suivi = res.status === 'fulfilled' ? res.value : null;
        return this.toRow(s, facturesMap, abonnesMap, dernierPaiement, suivi);
      });
      this.impayes.set(enriched);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('IMPAYES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private toRow(
    s: SoldeFacture,
    facturesMap: Map<string, { numeroFacture: string; abonneId: string }>,
    abonnesMap: Map<string, AbonneRef>,
    dernierPaiement: Map<string, string>,
    suivi: SuiviImpaye | null,
  ): ImpayeRow {
    const facture = facturesMap.get(s.factureId);
    const abonneId = suivi?.abonneId ?? facture?.abonneId ?? null;
    const abonne = abonneId ? abonnesMap.get(abonneId) : undefined;
    const retardJours = this.joursDepuis(suivi?.dateDepassement ?? null);

    const dp = dernierPaiement.get(s.factureId) ?? null;
    const enPause =
      s.soldeRestant > 0 &&
      s.montantPaye > 0 &&
      dp !== null &&
      (this.joursDepuis(dp) ?? Infinity) < PAUSE_ACOMPTE_JOURS;

    return {
      factureId: s.factureId,
      abonneId,
      abonneNom: abonne ? `${abonne.nom} ${abonne.prenom}`.trim() : '—',
      numeroAbonne: abonne?.numeroAbonne ?? '—',
      numeroFacture: facture?.numeroFacture ?? '—',
      montantTotal: s.montantTotal,
      montantPaye: s.montantPaye,
      soldeRestant: s.soldeRestant,
      statut: s.statut,
      etapeActuelle: suivi?.etapeActuelle ?? null,
      dateDepassement: suivi?.dateDepassement ?? null,
      retardJours,
      enPause,
    };
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  onEtapeChange(etape: number | 'TOUS'): void {
    this.filtreEtape.set(etape);
  }

  onTriChange(tri: 'ANCIENNETE' | 'SOLDE'): void {
    this.tri.set(tri);
  }

  ajouterPaiement(row: ImpayeRow): void {
    void this.router.navigate(['/factures', row.factureId], {
      queryParams: { paiement: 1 },
    });
  }

  voirRelances(row: ImpayeRow): void {
    void this.router.navigate(['/impayes', row.factureId, 'relances']);
  }

  exportBilan(): void {
    const rows = this.impayesFiltres();
    if (rows.length === 0) {
      this.toast.info(this.translate.instant('IMPAYES.BILAN_EMPTY'));
      return;
    }
    const headers = ['Abonné', 'N° abonné', 'Facture', 'Montant', 'Payé', 'Solde', 'Retard (j)', 'Étape'];
    const lines = rows.map((r) =>
      [
        r.abonneNom,
        r.numeroAbonne,
        r.numeroFacture,
        r.montantTotal,
        r.montantPaye,
        r.soldeRestant,
        r.retardJours ?? '',
        r.etapeActuelle ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)   // guillemets défensifs pour tout champ
        .join(';'),
    );
    const csv = '﻿' + [headers.map((h) => `"${h}"`).join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    // Nom composite avec date : évite l'écrasement silencieux si ré-export dans la journée.
    const filename = `bilan-impayes_${new Date().toISOString().slice(0, 10)}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success(this.translate.instant('IMPAYES.BILAN_SUCCESS', { filename }));
  }

  // ── Helpers de présentation ───────────────────────────────────────────────

  badgeState(row: ImpayeRow): BadgeState {
    if (row.etapeActuelle === 4) return 'suspendue';
    if (row.enPause) return 'pause';
    switch (row.etapeActuelle) {
      case 1: return 'etape1';
      case 2: return 'etape2';
      case 3: return 'etape3';
      default: return 'unknown';
    }
  }

  badgeLabel(row: ImpayeRow): string {
    const lang = this.translate.currentLang() ?? undefined;
    switch (this.badgeState(row)) {
      case 'suspendue': return this.translate.instant('IMPAYES.BADGE.SUSPENDUE', {}, lang);
      case 'pause': return this.translate.instant('IMPAYES.BADGE.PAUSE', {}, lang);
      case 'etape1': return this.translate.instant('IMPAYES.BADGE.ETAPE1', {}, lang);
      case 'etape2': return this.translate.instant('IMPAYES.BADGE.ETAPE2', {}, lang);
      case 'etape3': return this.translate.instant('IMPAYES.BADGE.ETAPE3', {}, lang);
      default: return '—';
    }
  }

  retardClass(retard: number | null): string {
    if (retard === null) return 'retard--muted';
    if (retard >= 10) return 'retard--danger';
    if (retard >= 3) return 'retard--warn';
    return 'retard--muted';
  }

  rowDanger = (row: ImpayeRow): string | null =>
    row.etapeActuelle === 4 ? 'dt__row--danger' : null;

  private joursDepuis(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.max(0, Math.floor(diff / 86_400_000));
  }

  formatNombre(n: number): string {
    return n.toLocaleString('fr-FR');
  }
}
