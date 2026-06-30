import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { extractGqlError } from '../../core/auth/auth.service';
import { UsersService } from '../../core/users/users.service';
import { Role, User } from '../../shared/models/user.model';
import { isValidCameroonPhone, normalizePhone, toLocalPhone } from '../../shared/utils/phone.utils';
import { AuthFieldComponent } from '../../shared/components/auth-field/auth-field.component';

export const ROLE_OPTIONS: { label: string; value: Role }[] = [
  { label: 'Agent terrain', value: 'AGENT' },
  { label: 'Comptable', value: 'COMPTABLE' },
  { label: 'Superviseur', value: 'SUPERVISEUR' },
  { label: 'Administrateur', value: 'ADMIN' },
];

@Component({
  selector: 'app-utilisateur-form',
  imports: [
    FormsModule,
    RouterLink,
    InputTextModule,
    SelectModule,
    ButtonModule,
    ToastModule,
    AuthFieldComponent,
  ],
  providers: [MessageService],
  templateUrl: './utilisateur-form.component.html',
  styleUrl: './utilisateur-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UtilisateurFormComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly roleOptions = ROLE_OPTIONS;

  readonly mode = signal<'create' | 'edit'>('create');
  readonly userId = signal<string | null>(null);
  readonly loadingUser = signal(false);

  readonly username = signal('');
  readonly phone = signal('');
  readonly role = signal<Role>('AGENT');
  readonly email = signal('');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isPhoneValid = computed(() => isValidCameroonPhone(this.phone().trim()));
  readonly normalizedPhone = computed(() => normalizePhone(this.phone().trim()));
  readonly requiresEmail = computed(() => this.role() === 'ADMIN');

  readonly isFormValid = computed(() => {
    if (this.mode() === 'create') {
      const usernameOk = this.username().trim().length >= 3;
      const phoneOk = this.isPhoneValid();
      const emailOk = !this.requiresEmail() || this.email().trim().includes('@');
      return usernameOk && phoneOk && emailOk && !this.loading();
    }
    // edit: at least one field changed, phone valid if provided
    const phoneOk = this.phone().trim() === '' || this.isPhoneValid();
    const emailOk = !this.requiresEmail() || this.email().trim().includes('@');
    return phoneOk && emailOk && !this.loading();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode.set('edit');
      this.userId.set(id);
      this.loadUser(id);
    }
  }

  private async loadUser(id: string): Promise<void> {
    this.loadingUser.set(true);
    try {
      const users = await this.usersService.getUsers();
      const user = users.find((u) => u.id === id);
      if (!user) {
        this.router.navigateByUrl('/utilisateurs');
        return;
      }
      this.prefill(user);
    } catch {
      this.router.navigateByUrl('/utilisateurs');
    } finally {
      this.loadingUser.set(false);
    }
  }

  private prefill(user: User): void {
    this.phone.set(toLocalPhone(user.phoneNumber));
    this.role.set(user.role);
    this.email.set(user.email ?? '');
  }

  async onSubmit(): Promise<void> {
    if (!this.isFormValid()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      if (this.mode() === 'create') {
        await this.usersService.createUser({
          username: this.username().trim(),
          phoneNumber: this.normalizedPhone(),
          role: this.role(),
          email: this.requiresEmail() ? this.email().trim() : undefined,
        });
        this.messageService.add({
          severity: 'success',
          summary: 'Compte créé',
          detail: `${this.username().trim()} recevra un code d'activation par WhatsApp.`,
          life: 4000,
        });
      } else {
        const id = this.userId()!;
        await this.usersService.updateUser(id, {
          phoneNumber: this.phone().trim() ? this.normalizedPhone() : undefined,
          role: this.role(),
          email: this.email().trim() || undefined,
        });
        this.messageService.add({
          severity: 'success',
          summary: 'Compte mis à jour',
          detail: 'Les modifications ont été enregistrées.',
          life: 3000,
        });
      }
      setTimeout(() => this.router.navigateByUrl('/utilisateurs'), 1500);
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      if (code === 'ALREADY_EXISTS') {
        this.errorMessage.set('Ce nom d\'utilisateur ou numéro de téléphone est déjà utilisé.');
      } else if (code === 'PERMISSION_DENIED') {
        this.errorMessage.set('Vous n\'avez pas les droits pour effectuer cette action.');
      } else {
        this.errorMessage.set(message || 'Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
