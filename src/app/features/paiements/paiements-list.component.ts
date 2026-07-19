import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Paiement, ModePaiement, StatutFacture } from '../../shared/models/facture.model';
import { BadgeComponent, BadgeTone } from '../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../shared/components/data-table/data-table.directives';
import { FcfaPipe, formatFcfa } from '../../shared/pipes/fcfa.pipe';

interface CampagneItem {
  campagneId: string;
  nom: string;
  periodeMois: number;
  periodeAnnee: number;
  statut: string;
}

interface FactureRef {
  factureId: string;
  numeroFacture: string;
  abonneId: string;
  abonneNom: string;
  campagneId: string;
  statut: StatutFacture;
}

interface PaiementRow {
  paiementId: string;
  factureId: string;
  numeroFacture: string;
  abonneNom: string;
  montant: number;
  datePaiement: string;
  modePaiement: ModePaiement;
  referenceTransaction: string;
  statutFacture: StatutFacture | null;
}

@Component({
  imports: [
    FormsModule,
    SelectModule,
    DatePickerModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FilterBarComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    FcfaPipe,
    BadgeComponent,
  ],
  templateUrl: './paiements-list.component.html',
  styleUrl: './paiements-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementsListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly paiements = signal<Paiement[]>([]);
  readonly campagnes = signal<CampagneItem[]>([]);
  readonly facturesMap = signal<Map<string, FactureRef>>(new Map());

  readonly selectedCampagneId = signal<string | null>(null);
  readonly filtreMode = signal<ModePaiement | 'TOUS'>('TOUS');
  readonly dateRange = signal<Date[] | null>(null);
  readonly searchTerm = signal('');

  readonly columns: DataTableColumn[] = [
    { key: 'date', header: 'PAIEMENTS.COL_DATE' },
    { key: 'abonne', header: 'PAIEMENTS.COL_ABONNE' },
    { key: 'numeroFacture', header: 'PAIEMENTS.COL_FACTURE' },
    { key: 'montant', header: 'PAIEMENTS.COL_MONTANT' },
    { key: 'mode', header: 'PAIEMENTS.COL_MODE' },
    { key: 'operateur', header: 'PAIEMENTS.COL_OPERATEUR' },
    { key: 'statut', header: 'PAIEMENTS.COL_STATUT' },
  ];

  readonly campagneOptions = computed((): Array<{ label: string; value: string | null }> => {
    const lang = this.translate.currentLang() ?? undefined;
    const all = { label: this.translate.instant('PAIEMENTS.CAMPAGNE_TOUTES', {}, lang), value: null };
    const items = this.campagnes().map((c) => ({ label: c.nom, value: c.campagneId }));
    return [all, ...items];
  });

  readonly modeOptions = computed((): Array<{ label: string; value: ModePaiement | 'TOUS' }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('PAIEMENTS.MODE_TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('FACTURATION.MODE.ESPECES', {}, lang), value: 'ESPECES' as const },
      { label: this.translate.instant('FACTURATION.MODE.MOBILE_MONEY', {}, lang), value: 'MOBILE_MONEY' as const },
      { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' as const },
    ];
  });

  readonly rows = computed((): PaiementRow[] => {
    const facturesMap = this.facturesMap();
    const campagneId = this.selectedCampagneId();

    let list = this.paiements();

    if (campagneId) {
      list = list.filter((p) => facturesMap.get(p.factureId)?.campagneId === campagneId);
    }

    const mode = this.filtreMode();
    if (mode !== 'TOUS') list = list.filter((p) => p.modePaiement === mode);

    const range = this.dateRange();
    if (range?.[0]) {
      const debut = range[0];
      list = list.filter((p) => new Date(p.datePaiement) >= debut);
    }
    if (range?.[1]) {
      const fin = new Date(range[1]);
      fin.setHours(23, 59, 59, 999);
      list = list.filter((p) => new Date(p.datePaiement) <= fin);
    }

    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      list = list.filter((p) => {
        const f = facturesMap.get(p.factureId);
        const nom = f?.abonneNom ?? '';
        return nom.toLowerCase().includes(term) || (f?.numeroFacture ?? '').toLowerCase().includes(term);
      });
    }

    return list.map((p) => {
      const f = facturesMap.get(p.factureId);
      return {
        paiementId: p.paiementId,
        factureId: p.factureId,
        numeroFacture: f?.numeroFacture ?? '—',
        abonneNom: f?.abonneNom || '—',
        montant: p.montant,
        datePaiement: p.datePaiement,
        modePaiement: p.modePaiement,
        referenceTransaction: p.referenceTransaction,
        statutFacture: f?.statut ?? null,
      };
    });
  });

  readonly totalMontant = computed(() => this.rows().reduce((acc, r) => acc + r.montant, 0));

  readonly subtitle = computed(() => {
    const campagneId = this.selectedCampagneId();
    const campagne = this.campagnes().find((c) => c.campagneId === campagneId);
    const periode = campagne ? this.formatPeriode(campagne) : '';
    const count = this.rows().length;
    const total = formatFcfa(this.totalMontant());
    return periode ? `${periode} · ${count} · ${total}` : `${count} · ${total}`;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Deux queries autorisées au COMPTABLE : les paiements et les factures
      // (enrichies côté Gateway du nom d'abonné + nom/période de campagne). On
      // en dérive les noms d'abonnés ET la liste des campagnes — plus besoin
      // des queries `abonnes`/`campagnes`, réservées à d'autres rôles.
      // Résilient : si les factures échouent, les paiements restent affichés.
      const [paiementsRes, facturesRes] = await Promise.allSettled([
        this.service.getAllPaiements(),
        this.service.getFactures(),
      ]);

      if (paiementsRes.status === 'rejected') {
        throw paiementsRes.reason;
      }
      const paiements = paiementsRes.value;
      const factures = facturesRes.status === 'fulfilled' ? facturesRes.value : [];

      // Toutes les factures (toutes campagnes) : résout abonné / n° facture /
      // statut d'un paiement via les libellés enrichis portés par la facture.
      const facturesMap = new Map<string, FactureRef>();
      for (const f of factures) {
        facturesMap.set(f.factureId, {
          factureId: f.factureId,
          numeroFacture: f.numeroFacture,
          abonneId: f.abonneId,
          abonneNom: f.abonneNom ?? '',
          campagneId: f.campagneId,
          statut: f.statut,
        });
      }
      this.facturesMap.set(facturesMap);

      // Liste des campagnes dérivée des factures (le COMPTABLE n'a pas accès à
      // la query `campagnes`) : une entrée par campagne distincte présente.
      const campMap = new Map<string, CampagneItem>();
      for (const f of factures) {
        if (f.campagneId && !campMap.has(f.campagneId)) {
          campMap.set(f.campagneId, {
            campagneId: f.campagneId,
            nom: f.campagneNom ?? '',
            periodeMois: f.campagnePeriodeMois ?? 0,
            periodeAnnee: f.campagnePeriodeAnnee ?? 0,
            statut: '',
          });
        }
      }
      const sorted = [...campMap.values()].sort((a, b) => {
        if (b.periodeAnnee !== a.periodeAnnee) return b.periodeAnnee - a.periodeAnnee;
        return b.periodeMois - a.periodeMois;
      });
      this.campagnes.set(sorted);

      const sortedPaiements = [...paiements].sort((a, b) =>
        b.datePaiement.localeCompare(a.datePaiement),
      );
      this.paiements.set(sortedPaiements);

      // Défaut : la campagne récente qui a effectivement des paiements.
      const campagnesAvecPaiements = new Set<string>();
      for (const p of sortedPaiements) {
        const f = facturesMap.get(p.factureId);
        if (f) campagnesAvecPaiements.add(f.campagneId);
      }
      const defaut = sorted.find((c) => campagnesAvecPaiements.has(c.campagneId));
      this.selectedCampagneId.set(defaut?.campagneId ?? null);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('PAIEMENTS.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  onCampagneChange(campagneId: string | null): void {
    this.selectedCampagneId.set(campagneId);
  }

  onModeChange(mode: ModePaiement | 'TOUS'): void {
    this.filtreMode.set(mode);
  }

  onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  voirFacture(factureId: string): void {
    void this.router.navigate(['/factures', factureId]);
  }

  exportCSV(): void {
    const rows = this.rows();
    const headers = ['Date', 'Abonné', 'Facture', 'Montant', 'Mode', 'Opérateur', 'Statut'];
    const lines = rows.map((r) =>
      [
        this.formatDate(r.datePaiement),
        r.abonneNom,
        r.numeroFacture,
        r.montant,
        r.modePaiement,
        '—',
        r.statutFacture ?? '—',
      ].join(';'),
    );
    const csv = [headers.join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paiements.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  }

  formatPeriode(c: CampagneItem): string {
    const str = new Date(c.periodeAnnee, c.periodeMois - 1, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  statutTone(r: PaiementRow): BadgeTone {
    if (r.statutFacture === 'PAYEE') return 'success';
    if (r.statutFacture === 'PARTIELLE') return 'warning';
    return 'neutral';
  }

  statutLabel(r: PaiementRow): string {
    if (r.statutFacture === 'PAYEE') return 'SOLDÉ';
    if (r.statutFacture === 'PARTIELLE') return 'PARTIEL ⚠';
    return r.statutFacture ?? '—';
  }
}
