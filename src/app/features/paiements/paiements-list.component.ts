import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { nomAbonneOuReference } from '../../shared/utils/abonne.utils';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { PAIEMENT_CREE_SUB } from '../../graphql/queries/factures.queries';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Paiement, ModePaiement } from '../../shared/models/facture.model';
import { BadgeComponent, BadgeTone } from '../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../shared/components/filters-panel/filters-panel.component';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../shared/components/data-table/data-table.directives';
import { FcfaPipe } from '../../shared/pipes/fcfa.pipe';
import { ToastService } from '../../shared/services/toast.service';
import type { PaiementCreeSubscription } from '../../graphql/generated';
import type { GetAllPaiementsQuery } from '../../graphql/generated';

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
  abonneNumero: string;
  campagneId: string;
  // `String` côté gateway : voir `factureStatutTone`.
  statut: string;
}

interface PaiementRow {
  paiementId: string;
  factureId: string;
  numeroFacture: string;
  abonneNom: string;
  montant: number;
  datePaiement: string;
  // La gateway type `modePaiement` en `String`, comme `statut` — le domaine
  // n'a que trois valeurs, mais le contrat n'en promet aucune.
  modePaiement: string;
  referenceTransaction: string;
  statutFacture: string | null;
  annule: boolean;
  motifAnnulation: string | null;
}

@Component({
  imports: [
    FormsModule,
    SelectModule,
    DatePickerModule,
    TranslatePipe,
    ErrorBannerComponent,
    PageTopbarComponent,
    FiltersPanelComponent,
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
  private readonly toast = inject(ToastService);
  private readonly apollo = inject(Apollo);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly paiements = signal<GetAllPaiementsQuery['paiements']>([]);
  readonly campagnes = signal<CampagneItem[]>([]);
  readonly facturesMap = signal<Map<string, FactureRef>>(new Map());

  readonly selectedCampagneId = signal<string | null>(null);
  readonly filtreMode = signal<ModePaiement | 'TOUS'>('TOUS');
  readonly dateRange = signal<Date[] | null>(null);
  readonly searchTerm = signal('');

  readonly columns: DataTableColumn[] = [
    { key: 'date', header: 'PAIEMENTS.COL_DATE', sortable: true, sortValue: (r) => new Date((r as PaiementRow).datePaiement) },
    { key: 'abonne', header: 'PAIEMENTS.COL_ABONNE', sortable: true, sortValue: (r) => (r as PaiementRow).abonneNom },
    { key: 'numeroFacture', header: 'PAIEMENTS.COL_FACTURE', sortable: true, sortValue: (r) => (r as PaiementRow).numeroFacture },
    { key: 'montant', header: 'PAIEMENTS.COL_MONTANT', sortable: true, sortValue: (r) => (r as PaiementRow).montant },
    { key: 'mode', header: 'PAIEMENTS.COL_MODE', sortable: true, sortValue: (r) => (r as PaiementRow).modePaiement },
    // Colonne « Référence » : donnée métier obligatoire (PRODUCT.md) pour
    // MOBILE_MONEY et VIREMENT. Anciennement « Opérateur » toujours vide.
    { key: 'reference', header: 'PAIEMENTS.COL_REFERENCE', sortable: true, sortValue: (r) => (r as PaiementRow).referenceTransaction ?? '' },
    { key: 'statut', header: 'PAIEMENTS.COL_STATUT', sortable: true, sortValue: (r) => (r as PaiementRow).statutFacture ?? '' },
  ];

  /** Filtres unifiés pour `<app-filters-panel>` (batch 10). Date range garde
   *  son propre p-datepicker externe (contrôle spécialisé). */
  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      {
        key: 'campagne',
        label: 'PAIEMENTS.FILTER_CAMPAGNE',
        options: this.campagnes().map((c) => ({ label: c.nom, value: c.campagneId })),
        render: 'select',
      },
      {
        key: 'mode',
        label: 'PAIEMENTS.FILTER_MODE',
        options: [
          { label: this.translate.instant('FACTURATION.MODE.ESPECES', {}, lang), value: 'ESPECES' },
          { label: this.translate.instant('FACTURATION.MODE.MOBILE_MONEY', {}, lang), value: 'MOBILE_MONEY' },
          { label: this.translate.instant('FACTURATION.MODE.VIREMENT', {}, lang), value: 'VIREMENT' },
        ],
      },
    ];
  });

  readonly filterValues = computed<FilterValues>(() => ({
    campagne: this.selectedCampagneId(),
    mode: this.filtreMode() === 'TOUS' ? null : this.filtreMode(),
  }));

  onFiltersChange(v: FilterValues): void {
    if (v['campagne'] !== this.selectedCampagneId()) this.onCampagneChange(v['campagne']);
    const mode = (v['mode'] as ModePaiement | null) ?? 'TOUS';
    if (mode !== this.filtreMode()) this.onModeChange(mode);
  }

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
        abonneNom: nomAbonneOuReference(f?.abonneNom, f?.abonneNumero),
        montant: p.montant,
        datePaiement: p.datePaiement,
        modePaiement: p.modePaiement,
        referenceTransaction: p.referenceTransaction,
        statutFacture: f?.statut ?? null,
        annule: p.annule ?? false,
        motifAnnulation: p.motifAnnulation ?? null,
      };
    });
  });

  /**
   * Total encaissé : un paiement annulé n'a jamais été encaissé, il ne peut pas
   * entrer dans ce total (PRODUCT.md § « Exactitude financière visible »).
   */
  readonly totalMontant = computed(() =>
    this.rows().reduce((acc, r) => (r.annule ? acc : acc + r.montant), 0),
  );

  /** Nombre de lignes annulées affichées — sert à expliquer l'écart au comptable. */
  readonly nbAnnules = computed(() => this.rows().filter((r) => r.annule).length);

  /** Montant total des annulations affichées, pour la mention sous le KPI. */
  readonly montantAnnule = computed(() =>
    this.rows().reduce((acc, r) => (r.annule ? acc + r.montant : acc), 0),
  );

  /**
   * Le bandeau ne dit que ce que la page ne dit pas ailleurs.
   *
   * Il affichait « Juillet 2026 · 12 · 146 000 FCFA » — soit exactement la carte
   * « Total encaissé » posée soixante pixels plus bas, qui donne le montant en
   * grand et « sur 12 transaction(s) affichée(s) » juste dessous. Le nombre et
   * le montant sont donc rendus à leur carte ; le bandeau garde la période,
   * seule information qui disparaît au défilement.
   */
  readonly subtitle = computed(() => {
    const campagneId = this.selectedCampagneId();
    const campagne = this.campagnes().find((c) => c.campagneId === campagneId);
    return campagne ? this.formatPeriode(campagne) : '';
  });

  ngOnInit(): void {
    void this.load().then(() => this.ecouterPaiements());
  }

  /**
   * `paiementCree` : un encaissement enregistré ailleurs apparaît ici.
   *
   * C'est le flux qui compte le plus des cinq. Cet écran est un journal de
   * caisse, consulté en continu pendant qu'un collègue encaisse au guichet ou
   * qu'un paiement Mobile Money arrive. Sans lui, le total en haut de page —
   * « 146 000 FCFA sur 12 transactions » — était juste au chargement puis faux,
   * silencieusement, sans que rien à l'écran ne le signale.
   *
   * Limite connue, côté serveur : `paiement` publie sur `EnregistrerPaiement`
   * seulement. Ni l'annulation d'un paiement, ni `EnregistrerPaiementAbonne`
   * (l'encaissement depuis la fiche abonné) n'émettent — ils resteront
   * invisibles jusqu'au rechargement.
   */
  private ecouterPaiements(): void {
    // La souscription ne porte pas les champs d'annulation : un paiement qui
    // vient d'être créé n'est par définition pas annulé, on les pose à leur
    // valeur neutre plutôt que de laisser `rows()` lire des `undefined`.
    type MajPaiement = Pick<
      Paiement,
      'paiementId' | 'factureId' | 'montant' | 'datePaiement'
      | 'modePaiement' | 'referenceTransaction'
    >;

    this.apollo
      .subscribe<PaiementCreeSubscription>({ query: PAIEMENT_CREE_SUB,
        context: { silentError: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const p = data?.paiementCree;
          if (!p) return;
          this.paiements.update((liste) => {
            // Le collègue qui vient d'encaisser reçoit aussi son propre
            // événement, après que sa mutation a déjà inséré la ligne.
            if (liste.some((x) => x.paiementId === p.paiementId)) return liste;
            const nouveau: GetAllPaiementsQuery['paiements'][number] = {
              ...p,
              createdAt: p.datePaiement,
              annule: false,
              // La gateway type ces trois champs en `String` non nul : un
              // paiement non annulé y porte la chaîne vide, jamais `null`.
              // Les mettre à `null` fabriquait une valeur que le serveur ne
              // produit pas — invisible tant que rien ne les lisait.
              annuleLe: '',
              annulePar: '',
              motifAnnulation: '',
            };
            // Journal antichronologique : le plus récent en tête.
            return [nouveau, ...liste];
          });
        },
        error: () => {
          /* temps réel indisponible — le journal garde son dernier chargement */
        },
      });
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
          abonneNumero: f.abonneNumero ?? '',
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
    if (rows.length === 0) {
      this.toast.info(this.translate.instant('PAIEMENTS.EXPORT_EMPTY'));
      return;
    }
    // BOM UTF-8 pour Excel Windows + colonne Référence remplace Opérateur vide.
    const headers = ['Date', 'Abonné', 'Facture', 'Montant', 'Mode', 'Référence', 'Statut', 'Annulé', "Motif d'annulation"];
    const lines = rows.map((r) =>
      [
        this.formatDate(r.datePaiement),
        r.abonneNom,
        r.numeroFacture,
        r.montant,
        r.modePaiement,
        r.referenceTransaction || '—',
        r.statutFacture ?? '—',
        r.annule ? 'OUI' : 'NON',
        r.motifAnnulation ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)   // guillemets pour tout champ (sécurité séparateur)
        .join(';'),
    );
    const csv = '﻿' + [headers.join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    // Nom fichier composite : date + campagne + mode → l'utilisateur sait quel
    // scope contient le CSV avant même de l'ouvrir.
    const parts: string[] = ['paiements', new Date().toISOString().slice(0, 10)];
    const c = this.campagnes().find((x) => x.campagneId === this.selectedCampagneId());
    if (c) parts.push(`${c.periodeAnnee}-${String(c.periodeMois).padStart(2, '0')}`);
    const mode = this.filtreMode();
    if (mode !== 'TOUS') parts.push(mode);
    const filename = `${parts.join('_')}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    // Confirmation avec périmètre exporté (fermeture P1 « export silencieux »).
    this.toast.success(
      this.translate.instant('PAIEMENTS.EXPORT_SUCCESS', { count: rows.length, filename }),
    );
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
    // i18n-aware : les libellés sont dans fr/en.json ; le tone=warning du badge
    // porte déjà le signal visuel, plus besoin de l'emoji ⚠ Unicode qui viole
    // la Règle de la Famille Unique et la promesse bilingue.
    if (r.statutFacture === 'PAYEE') return this.translate.instant('PAIEMENTS.STATUT_SOLDE');
    if (r.statutFacture === 'PARTIELLE') return this.translate.instant('PAIEMENTS.STATUT_PARTIEL');
    // Le statut brut de la gateway (« IMPAYEE », sans accent) s'affichait tel
    // quel dès qu'il sortait des deux cas ci-dessus.
    if (!r.statutFacture) return '—';
    return this.translate.instant('FACTURATION.STATUT.' + r.statutFacture);
  }
}
