import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService, extractGqlError } from '../../core/auth/auth.service';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-profil',
  imports: [
    FormsModule,
    PageTopbarComponent,
    TranslatePipe,
  ],
  templateUrl: './profil.component.html',
  styleUrl: './profil.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly user = this.authService.user;

  readonly initials = computed(() => {
    const u = this.user();
    return u ? u.username.charAt(0).toUpperCase() : '?';
  });

  // ── Email ──────────────────────────────────────────────────────────────────
  readonly email = signal('');
  readonly emailSaving = signal(false);
  readonly emailDirty = computed(() => this.email() !== (this.user()?.email ?? ''));

  // ── Mot de passe ───────────────────────────────────────────────────────────
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly passwordSaving = signal(false);
  readonly passwordMismatch = computed(
    () => this.confirmPassword() !== '' && this.newPassword() !== this.confirmPassword(),
  );
  readonly passwordValid = computed(
    () =>
      this.currentPassword() !== '' &&
      this.newPassword().length >= 8 &&
      !this.passwordMismatch(),
  );

  ngOnInit(): void {
    this.email.set(this.user()?.email ?? '');
  }

  async saveEmail(): Promise<void> {
    if (this.emailSaving() || !this.emailDirty()) return;
    this.emailSaving.set(true);
    try {
      await this.authService.updateEmail(this.email().trim());
      this.toast.success(this.translate.instant('PROFIL.SUCCESS_EMAIL'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.emailSaving.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordSaving() || !this.passwordValid()) return;
    this.passwordSaving.set(true);
    try {
      await this.authService.changePassword(
        this.currentPassword(),
        this.newPassword(),
      );
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.toast.success(this.translate.instant('PROFIL.SUCCESS_PASSWORD'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.passwordSaving.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
