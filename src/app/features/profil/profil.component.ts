import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService, extractGqlError } from '../../core/auth/auth.service';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-profil',
  imports: [PageTopbarComponent, TranslatePipe],
  templateUrl: './profil.component.html',
  styleUrl: './profil.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilComponent {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly user = this.authService.user;

  readonly initials = computed(() => {
    const u = this.user();
    return u ? u.username.charAt(0).toUpperCase() : '?';
  });

  readonly hasEmail = computed(() => !!this.user()?.email);

  readonly resetSending = signal(false);
  readonly resetSent = signal(false);

  /**
   * Envoie un lien de réinitialisation de mot de passe à l'e-mail du compte.
   * L'API n'expose pas de changement de mot de passe self-service (pas de
   * `changePassword`) : le seul chemin est `requestPasswordReset(email)`.
   */
  async requestPasswordReset(): Promise<void> {
    const email = this.user()?.email;
    if (!email || this.resetSending()) return;
    this.resetSending.set(true);
    try {
      await this.authService.requestPasswordReset(email);
      this.resetSent.set(true);
      this.toast.success(this.translate.instant('PROFIL.RESET_SENT'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.resetSending.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
