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
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { Abonne, StatutAbonne } from '../../../shared/models/abonne.model';
import { ABONNE_UPDATED_SUB } from '../../../graphql/queries/abonnes.queries';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { PageFiltersComponent } from '../../../shared/components/page-filters/page-filters.component';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';

@Component({
  selector: 'app-abonnes-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    ErrorBannerComponent,
    StatusBadgeComponent,
    PageTopbarComponent,
    PageFiltersComponent,
    CompteurPipe,
    TranslatePipe,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './abonnes-list.component.html',
  styleUrl: './abonnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonnesListComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  private abonnesQuery!: QueryRef<{ abonnes: Abonne[] }>;

  readonly abonnes = signal<Abonne[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

  readonly filteredAbonnes = computed(() => {
    let list = this.abonnes();
    const term = this.searchTerm().toLowerCase().trim();
    const statut = this.statutFilter();
    const quartier = this.quartierFilter();

    if (statut) list = list.filter((a) => a.statut === statut);
    if (quartier) list = list.filter((a) => a.compteur?.quartier === quartier);
    if (term) {
      list = list.filter(
        (a) =>
          `${a.nom} ${a.prenom}`.toLowerCase().includes(term) ||
          a.numeroAbonne.toLowerCase().includes(term),
      );
    }
    return list;
  });

  readonly statutSummary = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const all = this.abonnes();
    const actifs = all.filter((a) => a.statut === 'ACTIF').length;
    const suspendus = all.filter((a) => a.statut === 'SUSPENDU').length;
    const parts: string[] = [];
    if (actifs > 0) {
      parts.push(this.translate.instant(
        actifs > 1 ? 'ABONNES.SUMMARY_ACTIF_PLURAL' : 'ABONNES.SUMMARY_ACTIF_SINGULAR',
        { count: actifs }, lang,
      ));
    }
    if (suspendus > 0) {
      parts.push(this.translate.instant(
        suspendus > 1 ? 'ABONNES.SUMMARY_SUSPENDU_PLURAL' : 'ABONNES.SUMMARY_SUSPENDU_SINGULAR',
        { count: suspendus }, lang,
      ));
    }
    return parts.join(' · ');
  });

  readonly quartiersOptions = computed(() =>
    [
      ...new Set(
        this.abonnes()
          .map((a) => a.compteur?.quartier)
          .filter((q): q is string => !!q),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      .map((q) => ({ label: q, value: q })),
  );

  readonly statutOptions = computed((): Array<{ label: string; value: StatutAbonne }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('STATUS.ACTIF', {}, lang), value: 'ACTIF' },
      { label: this.translate.instant('STATUS.SUSPENDU', {}, lang), value: 'SUSPENDU' },
      { label: this.translate.instant('STATUS.RESILIE', {}, lang), value: 'RESILIE' },
    ];
  });

  ngOnInit(): void {
    this.abonnesQuery = this.abonnesService.watchAbonnes();

    this.abonnesQuery.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          if (data?.abonnes) {
            this.abonnes.set(data.abonnes as Abonne[]);
          } else if (!loading) {
            this.error.set(this.translate.instant('ERRORS.LOAD_ABONNES'));
          }
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNES'));
          this.loading.set(false);
        },
      });

    this.abonnesQuery.subscribeToMore<{ abonneUpdated: Abonne }>({
      document: ABONNE_UPDATED_SUB,
      updateQuery: (prev, { subscriptionData }): void | { abonnes: Abonne[] } => {
        const updated = subscriptionData.data?.abonneUpdated;
        if (!updated) return;
        return {
          abonnes: (prev.abonnes ?? []).map((a) =>
            a?.id === updated.id ? updated : (a as Abonne),
          ),
        } as { abonnes: Abonne[] };
      },
    });
  }

  async loadAbonnes(): Promise<void> {
    this.error.set(null);
    try {
      await this.abonnesQuery.refetch();
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.error.set(message || 'Impossible de charger la liste des abonnés.');
    }
  }

  voirAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}`);
  }

  modifierAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}/modifier`);
  }

  confirmReactiver(abonne: Abonne): void {
    this.confirmationService.confirm({
      header: `Réactiver ${abonne.nom} ${abonne.prenom} ?`,
      message: `L'abonné retrouvera un accès normal et sera inclus dans les prochaines campagnes de relevé.`,
      icon: 'pi pi-check-circle',
      acceptLabel: 'Réactiver',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.reactiverAbonne(abonne),
    });
  }

  private async reactiverAbonne(abonne: Abonne): Promise<void> {
    try {
      const updated = await this.abonnesService.reactiverAbonne(abonne.id);
      this.abonnes.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      this.messageService.add({
        severity: 'success',
        summary: 'Abonné réactivé',
        detail: `${abonne.nom} ${abonne.prenom} est de nouveau actif.`,
      });
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: message || 'Impossible de réactiver cet abonné.',
      });
    }
  }
}
