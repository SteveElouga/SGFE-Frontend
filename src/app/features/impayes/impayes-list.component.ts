import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { SoldeFacture, SuiviImpaye } from '../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { DataTableCellDirective } from '../../shared/components/data-table/data-table.directives';

interface ImpayeRow extends SoldeFacture {
  abonneId: string | null;
  etapeActuelle: number | null;
  dateDepassement: string | null;
}

@Component({
  imports: [
    SlicePipe,
    FormsModule,
    SelectModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FilterBarComponent,
    DataTableComponent,
    DataTableCellDirective,
  ],
  templateUrl: './impayes-list.component.html',
  styleUrl: './impayes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpayesListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly impayes = signal<ImpayeRow[]>([]);

  readonly filtreEtape = signal<number | 'TOUS'>('TOUS');

  readonly columns: DataTableColumn[] = [
    { key: 'abonne', header: 'IMPAYES.COL_ABONNE' },
    { key: 'facture', header: 'IMPAYES.COL_FACTURE' },
    { key: 'solde', header: 'IMPAYES.COL_SOLDE' },
    { key: 'etape', header: 'IMPAYES.COL_ETAPE' },
    { key: 'depassement', header: 'IMPAYES.COL_DEPASSEMENT' },
    { key: 'actions', header: 'IMPAYES.COL_ACTIONS' },
  ];

  readonly etapeOptions = computed((): Array<{ label: string; value: number | 'TOUS' }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('IMPAYES.ETAPE_TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('IMPAYES.ETAPE.1', {}, lang), value: 1 },
      { label: this.translate.instant('IMPAYES.ETAPE.2', {}, lang), value: 2 },
      { label: this.translate.instant('IMPAYES.ETAPE.3', {}, lang), value: 3 },
      { label: this.translate.instant('IMPAYES.ETAPE.4', {}, lang), value: 4 },
    ];
  });

  readonly impayesFiltres = computed(() => {
    const etape = this.filtreEtape();
    if (etape === 'TOUS') return this.impayes();
    return this.impayes().filter((i) => i.etapeActuelle === etape);
  });

  readonly totalDu = computed(() =>
    this.impayesFiltres().reduce((acc, i) => acc + i.soldeRestant, 0),
  );

  readonly subtitle = computed(() => {
    const count = this.impayesFiltres().length;
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('IMPAYES.SUBTITLE', { count }, lang);
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const soldes = await this.service.getImpayes();
      const rows: ImpayeRow[] = soldes.map((s) => ({
        ...s,
        abonneId: null,
        etapeActuelle: null,
        dateDepassement: null,
      }));
      this.impayes.set(rows);

      const suivis = await Promise.allSettled(
        soldes.map((s) => this.service.getSuiviImpaye(s.factureId)),
      );
      const enriched = rows.map((r, i) => {
        const res = suivis[i];
        if (res.status === 'fulfilled') {
          const s: SuiviImpaye = res.value;
          return { ...r, abonneId: s.abonneId, etapeActuelle: s.etapeActuelle, dateDepassement: s.dateDepassement };
        }
        return r;
      });
      this.impayes.set(enriched);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('IMPAYES.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  onEtapeChange(etape: number | 'TOUS'): void {
    this.filtreEtape.set(etape);
  }

  voirFacture(factureId: string): void {
    void this.router.navigate(['/factures', factureId]);
  }

  etapeClass(etape: number | null): string {
    switch (etape) {
      case 1: return 'etape-badge--1';
      case 2: return 'etape-badge--2';
      case 3: return 'etape-badge--3';
      case 4: return 'etape-badge--4';
      default: return 'etape-badge--unknown';
    }
  }

  formatFCFA(n: number): string {
    return `${n.toLocaleString('fr-FR')} FCFA`;
  }

  formatDate(d: string | null): string {
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
}
