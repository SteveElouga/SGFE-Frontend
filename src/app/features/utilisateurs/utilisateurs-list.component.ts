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
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { extractGqlError } from '../../core/auth/auth.service';
import { UsersService } from '../../core/users/users.service';
import { Role, User } from '../../shared/models/user.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  AGENT: 'Agent terrain',
  COMPTABLE: 'Comptable',
  SUPERVISEUR: 'Superviseur',
};

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

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');

  readonly filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.users();
    return this.users().filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.phoneNumber.includes(term),
    );
  });

  readonly roleLabel = (role: Role) => ROLE_LABELS[role];
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
      this.error.set(message || 'Impossible de charger la liste des utilisateurs.');
    } finally {
      this.loading.set(false);
    }
  }

  editUser(user: User): void {
    this.router.navigateByUrl(`/utilisateurs/${user.id}`);
  }

  confirmDeactivate(user: User): void {
    this.confirmationService.confirm({
      header: `Désactiver ${user.username} ?`,
      message: `L'utilisateur ne pourra plus se connecter. Cette action est réversible.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Désactiver',
      rejectLabel: 'Annuler',
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
        summary: 'Compte désactivé',
        detail: `${user.username} ne peut plus se connecter.`,
      });
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: message || 'Impossible de désactiver ce compte.',
      });
    }
  }
}
