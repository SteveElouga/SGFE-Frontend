import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { UsersService } from '../../../core/users/users.service';
import { Role, User } from '../../../shared/models/user.model';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../../shared/components/filters-panel/filters-panel.component';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { ToastService } from '../../../shared/services/toast.service';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCardDirective, DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';

@Component({
  selector: 'app-utilisateurs-list',
  imports: [
    DatePipe,
    RouterLink,
    DataTableComponent,
    DataTableCellDirective,
    DataTableCardDirective,
    ConfirmDialogModule,
    ErrorBannerComponent,
    PageTopbarComponent,
    FiltersPanelComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './utilisateurs-list.component.html',
  styleUrl: './utilisateurs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UtilisateursListComponent implements OnInit {
  /** Destination d'une ligne : la fiche utilisateur. */
  protected readonly lienUtilisateur = (u: { id: string }) => ['/utilisateurs', u.id];

  private readonly usersService = inject(UsersService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly filtreRole = signal<Role | null>(null);
  readonly filtreStatut = signal<'TOUS' | 'ACTIF' | 'INACTIF'>('TOUS');

  readonly columns: DataTableColumn[] = [
    { key: 'username', header: 'UTILISATEURS.USERNAME', sortable: true, sortValue: (r) => (r as { username: string }).username },
    { key: 'email', header: 'UTILISATEURS.EMAIL', sortable: true, sortValue: (r) => (r as { email?: string }).email ?? '' },
    { key: 'role', header: 'UTILISATEURS.ROLE', sortable: true, sortValue: (r) => (r as { role: string }).role },
    { key: 'createdAt', header: 'UTILISATEURS.CREATED_AT', sortable: true, sortValue: (r) => new Date((r as { createdAt: string }).createdAt) },
    { key: 'statut', header: 'COMMON.STATUS', sortable: true, sortValue: (r) => (r as { isActive?: boolean }).isActive ? 'ACTIF' : 'INACTIF' },
    { key: 'actions', header: '' },
  ];

  /** Message d'état vide (résolu avec le terme de recherche si présent). */
  readonly emptyMsg = computed(() => {
    const term = this.searchTerm();
    return term
      ? this.translate.instant('UTILISATEURS.NO_RESULT_SEARCH', { term })
      : this.translate.instant('UTILISATEURS.NO_RESULT');
  });

  readonly subtitle = computed(() => {
    const count = this.users().length;
    const key = count === 1 ? 'UTILISATEURS.SUBTITLE_SINGULAR' : 'UTILISATEURS.SUBTITLE_PLURAL';
    return this.translate.instant(key, { count });
  });

  /** Filtres unifiés (batch 10) : role + statut, tous 2 en select. */
  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      {
        key: 'role',
        label: 'UTILISATEURS.FILTRE_ROLE',
        options: [
          { label: this.translate.instant('UTILISATEURS.ROLES.AGENT', {}, lang), value: 'AGENT' },
          { label: this.translate.instant('UTILISATEURS.ROLES.COMPTABLE', {}, lang), value: 'COMPTABLE' },
          { label: this.translate.instant('UTILISATEURS.ROLES.SUPERVISEUR', {}, lang), value: 'SUPERVISEUR' },
          { label: this.translate.instant('UTILISATEURS.ROLES.ADMIN', {}, lang), value: 'ADMIN' },
        ],
      },
      {
        key: 'statut',
        label: 'COMMON.STATUS',
        options: [
          { label: this.translate.instant('UTILISATEURS.STATUT.ACTIF', {}, lang), value: 'ACTIF' },
          { label: this.translate.instant('UTILISATEURS.STATUT.INACTIF', {}, lang), value: 'INACTIF' },
        ],
      },
    ];
  });

  readonly filterValues = computed<FilterValues>(() => ({
    role: this.filtreRole(),
    statut: this.filtreStatut() === 'TOUS' ? null : this.filtreStatut(),
  }));

  onFiltersChange(v: FilterValues): void {
    this.filtreRole.set((v['role'] as Role | null) ?? null);
    this.filtreStatut.set((v['statut'] as 'ACTIF' | 'INACTIF' | null) ?? 'TOUS');
  }

  readonly filteredUsers = computed(() => {
    let list = this.users();

    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term) ||
          u.phoneNumber.includes(term),
      );
    }

    const role = this.filtreRole();
    if (role) list = list.filter((u) => u.role === role);

    const statut = this.filtreStatut();
    if (statut === 'ACTIF') list = list.filter((u) => u.isActive);
    if (statut === 'INACTIF') list = list.filter((u) => !u.isActive);

    return list;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const users = await this.usersService.getUsers();
      this.users.set(users);
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.error.set(message || this.translate.instant('ERRORS.LOAD_USERS'));
    } finally {
      this.loading.set(false);
    }
  }

  editUser(user: User): void {
    this.router.navigateByUrl(`/utilisateurs/${user.id}`);
  }

  confirmDeactivate(user: User): void {
    this.confirmationService.confirm({
      header: this.translate.instant('UTILISATEURS.DESACTIVER') + ` ${user.username} ?`,
      message: this.translate.instant('UTILISATEURS.DESACTIVER_CONFIRM'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('UTILISATEURS.DESACTIVER'),
      rejectLabel: this.translate.instant('COMMON.CANCEL'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deactivateUser(user),
    });
  }

  private async deactivateUser(user: User): Promise<void> {
    try {
      const updated = await this.usersService.deactivateUser(user.id);
      this.users.update((list) =>
        list.map((u) => (u.id === updated.id ? updated : u)),
      );
      this.toast.success(this.translate.instant('UTILISATEURS.SUCCESS_DESACTIVATION'), this.translate.instant('UTILISATEURS.SUCCESS_DESACTIVATION_DETAIL', { username: user.username }));
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(this.translate.instant('ERRORS.GENERIC'), message || this.translate.instant('ERRORS.GENERIC'));
    }
  }

  async reactivate(user: User): Promise<void> {
    try {
      const updated = await this.usersService.reactivateUser(user.id);
      this.users.update((list) =>
        list.map((u) => (u.id === updated.id ? updated : u)),
      );
      this.toast.success(this.translate.instant('UTILISATEURS.SUCCESS_REACTIVATION'), this.translate.instant('UTILISATEURS.SUCCESS_REACTIVATION_DETAIL', { username: user.username }));
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(this.translate.instant('ERRORS.GENERIC'), message || this.translate.instant('ERRORS.GENERIC'));
    }
  }

  initial(user: User): string {
    return (user.username[0] ?? '?').toUpperCase();
  }
}
