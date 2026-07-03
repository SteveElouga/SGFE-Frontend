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
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { DatePickerModule } from 'primeng/datepicker';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Paiement, ModePaiement, StatutFacture } from '../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';
import { GET_ABONNES } from '../../graphql/queries/abonnes.queries';
import { GET_FACTURES_PAR_CAMPAGNE } from '../../graphql/queries/factures.queries';

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
  statut: StatutFacture;
}

interface AbonneRef {
  id: string;
  nom: string;
  prenom: string;
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
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    DatePickerModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
  ],
  templateUrl: './paiements-list.component.html',
  styleUrl: './paiements-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementsListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly apollo = inject(Apollo);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly loadingFactures = signal(false);
  readonly error = signal<string | null>(null);

  readonly paiements = signal<Paiement[]>([]);
  readonly campagnes = signal<CampagneItem[]>([]);
  readonly abonnesMap = signal<Map<string, string>>(new Map());
  readonly facturesMap = signal<Map<string, FactureRef>>(new Map());

  readonly selectedCampagneId = signal<string | null>(null);
  readonly filtreMode = signal<ModePaiement | 'TOUS'>('TOUS');
  readonly dateRange = signal<Date[] | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(0);
  readonly pageSize = 5;

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
      { label: this.translate.instant('FACTURATION.MODE.CHEQUE', {}, lang), value: 'CHEQUE' as const },
      { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' as const },
    ];
  });

  readonly rows = computed((): PaiementRow[] => {
    const facturesMap = this.facturesMap();
    const abonnesMap = this.abonnesMap();
    const campagneId = this.selectedCampagneId();

    let list = this.paiements();

    if (campagneId && facturesMap.size > 0) {
      const ids = new Set(facturesMap.keys());
      list = list.filter((p) => ids.has(p.factureId));
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
        const nom = f ? (abonnesMap.get(f.abonneId) ?? '') : '';
        return nom.toLowerCase().includes(term) || (f?.numeroFacture ?? '').toLowerCase().includes(term);
      });
    }

    return list.map((p) => {
      const f = facturesMap.get(p.factureId);
      return {
        paiementId: p.paiementId,
        factureId: p.factureId,
        numeroFacture: f?.numeroFacture ?? '—',
        abonneNom: f ? (abonnesMap.get(f.abonneId) ?? '—') : '—',
        montant: p.montant,
        datePaiement: p.datePaiement,
        modePaiement: p.modePaiement,
        referenceTransaction: p.referenceTransaction,
        statutFacture: f?.statut ?? null,
      };
    });
  });

  readonly totalCount = computed(() => this.rows().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  readonly pagedRows = computed(() => {
    const start = this.page() * this.pageSize;
    return this.rows().slice(start, start + this.pageSize);
  });
  readonly rangeStart = computed(() =>
    this.totalCount() === 0 ? 0 : this.page() * this.pageSize + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min((this.page() + 1) * this.pageSize, this.totalCount()),
  );
  readonly totalMontant = computed(() => this.rows().reduce((acc, r) => acc + r.montant, 0));

  readonly visiblePages = computed((): number[] => {
    const total = this.pageCount();
    const current = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    const start = Math.max(0, Math.min(current - 2, total - 5));
    return Array.from({ length: 5 }, (_, i) => start + i);
  });

  readonly subtitle = computed(() => {
    const campagneId = this.selectedCampagneId();
    const campagne = this.campagnes().find((c) => c.campagneId === campagneId);
    const periode = campagne ? this.formatPeriode(campagne) : '';
    const count = this.totalCount();
    const total = this.formatFCFA(this.totalMontant());
    return periode ? `${periode} · ${count} · ${total}` : `${count} · ${total}`;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [campagnesRes, paiementsRes, abonnesRes] = await Promise.all([
        firstValueFrom(
          this.apollo.query<{ campagnes: CampagneItem[] }>({
            query: GET_CAMPAGNES,
            fetchPolicy: 'cache-first',
          }),
        ),
        this.service.getAllPaiements(),
        firstValueFrom(
          this.apollo.query<{ abonnes: AbonneRef[] }>({
            query: GET_ABONNES,
            fetchPolicy: 'cache-first',
          }),
        ),
      ]);

      const abonnesMap = new Map<string, string>();
      for (const a of abonnesRes.data?.abonnes ?? []) {
        abonnesMap.set(a.id, `${a.prenom} ${a.nom}`);
      }
      this.abonnesMap.set(abonnesMap);

      const sorted = [...(campagnesRes.data?.campagnes ?? [])].sort((a, b) => {
        if (b.periodeAnnee !== a.periodeAnnee) return b.periodeAnnee - a.periodeAnnee;
        return b.periodeMois - a.periodeMois;
      });
      this.campagnes.set(sorted);

      const sortedPaiements = [...paiementsRes].sort((a, b) =>
        b.datePaiement.localeCompare(a.datePaiement),
      );
      this.paiements.set(sortedPaiements);

      if (sorted.length > 0) {
        const mostRecent = sorted[0];
        this.selectedCampagneId.set(mostRecent.campagneId);
        await this.loadFacturesByCampagne(mostRecent.campagneId);
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('PAIEMENTS.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFacturesByCampagne(campagneId: string): Promise<void> {
    this.loadingFactures.set(true);
    try {
      const result = await firstValueFrom(
        this.apollo.query<{ facturesParCampagne: FactureRef[] }>({
          query: GET_FACTURES_PAR_CAMPAGNE,
          variables: { campagneId },
          fetchPolicy: 'cache-first',
        }),
      );
      const map = new Map<string, FactureRef>();
      for (const f of result.data?.facturesParCampagne ?? []) {
        map.set(f.factureId, f);
      }
      this.facturesMap.set(map);
    } catch {
      this.facturesMap.set(new Map());
    } finally {
      this.loadingFactures.set(false);
    }
  }

  onCampagneChange(campagneId: string | null): void {
    this.selectedCampagneId.set(campagneId);
    this.page.set(0);
    if (campagneId) {
      void this.loadFacturesByCampagne(campagneId);
    } else {
      this.facturesMap.set(new Map());
    }
  }

  onModeChange(mode: ModePaiement | 'TOUS'): void {
    this.filtreMode.set(mode);
    this.page.set(0);
  }

  onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    this.page.set(0);
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.page.set(0);
  }

  goPage(p: number): void {
    this.page.set(p);
  }

  voirFacture(factureId: string): void {
    void this.router.navigate(['/factures', factureId]);
  }

  exportCSV(): void {
    const rows = this.rows();
    const headers = ['Date', 'Abonné', 'Facture', 'Montant', 'Mode', 'Statut'];
    const lines = rows.map((r) =>
      [
        this.formatDate(r.datePaiement),
        r.abonneNom,
        r.numeroFacture,
        r.montant,
        r.modePaiement,
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

  formatFCFA(n: number): string {
    return `${n.toLocaleString('fr-FR')} FCFA`;
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

  statutClass(r: PaiementRow): string {
    if (r.statutFacture === 'PAYEE') return 'solde';
    if (r.statutFacture === 'PARTIELLE') return 'partiel';
    return 'autre';
  }

  statutLabel(r: PaiementRow): string {
    if (r.statutFacture === 'PAYEE') return 'SOLDÉ';
    if (r.statutFacture === 'PARTIELLE') return 'PARTIEL ⚠';
    return r.statutFacture ?? '—';
  }
}
