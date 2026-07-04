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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { UsersService } from '../../../core/users/users.service';
import { Role, User } from '../../../shared/models/user.model';
import { isValidCameroonPhone, normalizePhone, toLocalPhone } from '../../../shared/utils/phone.utils';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { ToastService } from '../../../shared/services/toast.service';

// Passe à `true` quand le backend a déployé reactivateUser + resendUserActivation
// (cf. docs/BESOINS_API_utilisateurs.md). Tant que false, ces boutons sont
// désactivés avec un tooltip « bientôt disponible » — aucune mutation fantôme.
const ACTIVATION_ACTIONS_READY = false;

@Component({
  selector: 'app-utilisateur-edit',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    InputTextModule,
    SelectModule,
    DialogModule,
    TranslatePipe,
    TooltipDirective,
  ],
  templateUrl: './utilisateur-edit.component.html',
  styleUrl: './utilisateur-edit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UtilisateurEditComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly activationReady = ACTIVATION_ACTIONS_READY;

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  // Champs éditables
  readonly email = signal('');
  readonly phone = signal('');
  readonly role = signal<Role>('AGENT');

  // Valeurs d'origine (détection des modifications)
  private readonly original = signal<{ email: string; phone: string; role: Role }>({
    email: '',
    phone: '',
    role: 'AGENT',
  });

  readonly saving = signal(false);
  readonly statutLoading = signal(false);
  readonly resendLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly deactivateDialogVisible = signal(false);

  readonly roleOptions = computed((): Array<{ label: string; value: Role }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('UTILISATEURS.ROLES.ADMIN', {}, lang), value: 'ADMIN' },
      { label: this.translate.instant('UTILISATEURS.ROLES.AGENT', {}, lang), value: 'AGENT' },
      { label: this.translate.instant('UTILISATEURS.ROLES.COMPTABLE', {}, lang), value: 'COMPTABLE' },
      { label: this.translate.instant('UTILISATEURS.ROLES.SUPERVISEUR', {}, lang), value: 'SUPERVISEUR' },
    ];
  });

  readonly initials = computed(() => {
    const u = this.user();
    return u ? (u.username[0] ?? '?').toUpperCase() : '?';
  });

  readonly roleClass = computed(() => `role-${this.role().toLowerCase()}`);

  // Le canal d'activation est déduit du rôle : ADMIN = e-mail, sinon WhatsApp
  readonly channelIsEmail = computed(() => this.role() === 'ADMIN');

  readonly isPhoneValid = computed(() => isValidCameroonPhone(this.phone().trim()));
  private readonly normalizedPhone = computed(() => normalizePhone(this.phone().trim()));
  readonly emailValid = computed(() => {
    // Email obligatoire uniquement pour ADMIN
    if (this.role() !== 'ADMIN') return true;
    return this.email().trim().includes('@');
  });

  readonly isDirty = computed(() => {
    const o = this.original();
    return (
      this.email().trim() !== o.email ||
      this.phone().trim() !== o.phone ||
      this.role() !== o.role
    );
  });

  readonly canSave = computed(
    () => this.isDirty() && this.isPhoneValid() && this.emailValid() && !this.saving(),
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigateByUrl('/utilisateurs');
      return;
    }
    void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const users = await this.usersService.getUsers();
      const user = users.find((u) => u.id === id);
      if (!user) {
        this.notFound.set(true);
        return;
      }
      this.user.set(user);
      this.prefill(user);
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private prefill(user: User): void {
    const localPhone = toLocalPhone(user.phoneNumber);
    const email = user.email ?? '';
    this.email.set(email);
    this.phone.set(localPhone);
    this.role.set(user.role);
    this.original.set({ email: email.trim(), phone: localPhone.trim(), role: user.role });
  }

  goBack(): void {
    this.router.navigateByUrl('/utilisateurs');
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const id = this.user()?.id;
    if (!id) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.usersService.updateUser(id, {
        email: this.email().trim() || undefined,
        phoneNumber: this.phone().trim() ? this.normalizedPhone() : undefined,
        role: this.role(),
      });
      this.user.set(updated);
      this.prefill(updated);
      this.toast.success(this.translate.instant('UTILISATEURS.EDIT.SUCCESS_SAVE'), this.translate.instant('UTILISATEURS.EDIT.SUCCESS_SAVE_DETAIL'));
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      if (code === 'ALREADY_EXISTS') {
        this.errorMessage.set(this.translate.instant('ERRORS.ALREADY_EXISTS'));
      } else if (code === 'PERMISSION_DENIED') {
        this.errorMessage.set(this.translate.instant('ERRORS.UNAUTHORIZED'));
      } else {
        this.errorMessage.set(message || this.translate.instant('ERRORS.GENERIC'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  // ── Statut du compte ──────────────────────────────────────────────────────

  confirmDeactivate(): void {
    this.deactivateDialogVisible.set(true);
  }

  async doDeactivate(): Promise<void> {
    const u = this.user();
    if (!u) return;
    this.statutLoading.set(true);
    try {
      const updated = await this.usersService.deactivateUser(u.id);
      this.user.set(updated);
      this.deactivateDialogVisible.set(false);
      this.toast.success(this.translate.instant('UTILISATEURS.EDIT.SUCCESS_DEACTIVATED'), this.translate.instant('UTILISATEURS.EDIT.SUCCESS_DEACTIVATED_DETAIL', { username: u.username }));
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.statutLoading.set(false);
    }
  }

  async reactivate(): Promise<void> {
    const u = this.user();
    if (!u || !this.activationReady) return;
    this.statutLoading.set(true);
    try {
      const updated = await this.usersService.reactivateUser(u.id);
      this.user.set(updated);
      this.toast.success(this.translate.instant('UTILISATEURS.EDIT.SUCCESS_REACTIVATED'), this.translate.instant('UTILISATEURS.EDIT.SUCCESS_REACTIVATED_DETAIL', { username: u.username }));
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.statutLoading.set(false);
    }
  }

  // ── Réinitialisation / renvoi d'activation (même mutation) ─────────────────

  async resendActivation(): Promise<void> {
    const u = this.user();
    if (!u || !this.activationReady) return;
    this.resendLoading.set(true);
    try {
      await this.usersService.resendUserActivation(u.id);
      const detailKey = u.role === 'ADMIN'
        ? 'UTILISATEURS.EDIT.SUCCESS_RESENT_EMAIL'
        : 'UTILISATEURS.EDIT.SUCCESS_RESENT_WHATSAPP';
      this.toast.success(this.translate.instant('UTILISATEURS.EDIT.SUCCESS_RESENT'), this.translate.instant(detailKey, { username: u.username }));
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.resendLoading.set(false);
    }
  }
}
