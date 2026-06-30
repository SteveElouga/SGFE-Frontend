import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../core/auth/auth.service';
import { UsersService } from '../../core/users/users.service';
import { Role, User } from '../../shared/models/user.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { PageFiltersComponent } from '../../shared/components/page-filters/page-filters.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

const ROLE_SEVERITY: Record<Role, 'danger' | 'warn' | 'success' | 'info'> = {
  ADMIN: 'danger',
  AGENT: 'success',
  COMPTABLE: 'info',
  SUPERVISEUR: 'warn',
};

@Component({
  selector: 'app-utilisateurs-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TableModule,
    TagModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    ConfirmDialogModule,
    ToastModule,
    ErrorBannerComponent,
    StatusBadgeComponent,
    PageTopbarComponent,
    PageFiltersComponent,
    TooltipDirective,
    SelectModule,
    TranslatePipe,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './utilisateurs-list.component.html',
  styleUrl: './utilisateurs-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UtilisateursListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly filtreRole = signal<Role | null>(null);
  readonly filtreStatut = signal<'TOUS' | 'ACTIF' | 'INACTIF'>('TOUS');

  readonly subtitle = computed(() => {
    const count = this.users().length;
    const key = count === 1 ? 'UTILISATEURS.SUBTITLE_SINGULAR' : 'UTILISATEURS.SUBTITLE_PLURAL';
    return this.translate.instant(key, { count });
  });

  readonly roleOptions = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('UTILISATEURS.ROLES.AGENT', {}, lang), value: 'AGENT' },
      { label: this.translate.instant('UTILISATEURS.ROLES.COMPTABLE', {}, lang), value: 'COMPTABLE' },
      { label: this.translate.instant('UTILISATEURS.ROLES.SUPERVISEUR', {}, lang), value: 'SUPERVISEUR' },
      { label: this.translate.instant('UTILISATEURS.ROLES.ADMIN', {}, lang), value: 'ADMIN' },
    ];
  });

  readonly statutOptions = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('UTILISATEURS.STATUT.TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('UTILISATEURS.STATUT.ACTIF', {}, lang), value: 'ACTIF' },
      { label: this.translate.instant('UTILISATEURS.STATUT.INACTIF', {}, lang), value: 'INACTIF' },
    ];
  });

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

  readonly roleSeverity = (role: Role) => ROLE_SEVERITY[role];

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
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('UTILISATEURS.SUCCESS_DESACTIVATION'),
        detail: this.translate.instant('UTILISATEURS.SUCCESS_DESACTIVATION_DETAIL', { username: user.username }),
      });
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('ERRORS.GENERIC'),
        detail: message || this.translate.instant('ERRORS.GENERIC'),
      });
    }
  }
}
