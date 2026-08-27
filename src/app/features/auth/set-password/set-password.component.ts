import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthBackLinkComponent } from '../../../shared/components/auth-back-link/auth-back-link.component';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthErrorMessageComponent } from '../../../shared/components/auth-error-message/auth-error-message.component';
import { AuthFieldComponent } from '../../../shared/components/auth-field/auth-field.component';
import { AuthMobileNavComponent } from '../../../shared/components/auth-mobile-nav/auth-mobile-nav.component';
import { AuthSubmitButtonComponent } from '../../../shared/components/auth-submit-button/auth-submit-button.component';
import { AuthSuccessHeaderComponent } from '../../../shared/components/auth-success-header/auth-success-header.component';

export type SetPasswordMode = 'activate' | 'reset';

const MIN_PASSWORD_LENGTH = 8;

interface RoleMeta { desc: string; badgeClass: string; }
const ROLE_META: Record<string, RoleMeta> = {
  ADMIN:       { desc: 'Accès complet au système',    badgeClass: 'admin' },
  AGENT:       { desc: 'Relevés terrain (mobile PWA)', badgeClass: 'agent' },
  COMPTABLE:   { desc: 'Facturation & paiements',     badgeClass: 'comptable' },
  SUPERVISEUR: { desc: 'Pilotage de ses campagnes',   badgeClass: 'superviseur' },
};

@Component({
  imports: [
    TranslatePipe,
    FormsModule,
    RouterLink,
    InputTextModule,
    PasswordModule,
    AuthBrandPanelComponent,
    AuthMobileNavComponent,
    AuthBackLinkComponent,
    AuthFieldComponent,
    AuthErrorMessageComponent,
    AuthSubmitButtonComponent,
    AuthSuccessHeaderComponent,
  ],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent {
  readonly mode: SetPasswordMode;
  private readonly token: string | null;

  // Activate-mode pre-filled info (from query params)
  readonly prefilledUsername: string;
  readonly prefilledEmail: string;
  readonly prefilledRole: string;
  readonly roleMeta: RoleMeta;

  readonly fullName       = signal('');
  readonly password       = signal('');
  readonly confirmPassword = signal('');
  readonly loading        = signal(false);
  readonly success        = signal(false);
  readonly errorMessage   = signal<string | null>(null);

  readonly passwordsMatch = computed(
    () => this.password() === this.confirmPassword() || this.confirmPassword().length === 0,
  );

  readonly passwordStrength = computed(() => {
    const p = this.password();
    return (
      (p.length >= 8 ? 1 : 0) +
      (/[A-Z]/.test(p) ? 1 : 0) +
      (/[0-9]/.test(p)  ? 1 : 0) +
      (/[^a-zA-Z0-9]/.test(p) ? 1 : 0)
    );
  });

  readonly strengthMeta = computed(() => {
    const s = this.passwordStrength();
    if (s <= 1) return { text: 'Faible',     color: '#ef4444' };
    if (s === 2) return { text: 'Moyenne',    color: '#f59e0b' };
    if (s === 3) return { text: 'Forte',      color: '#0e9f6e' };
    return           { text: 'Très forte',  color: '#0e9f6e' };
  });

  readonly canSubmit = computed(() => {
    if (!this.token || this.loading()) return false;
    const pwdOk =
      this.password().length >= MIN_PASSWORD_LENGTH &&
      this.password() === this.confirmPassword();
    return this.mode === 'activate'
      ? pwdOk && this.fullName().trim().length > 0
      : pwdOk;
  });

  // Used in @for loop for the 4 strength bars
  readonly strengthBars = [0, 1, 2, 3];

  private readonly auth = inject(AuthService);

  constructor(route: ActivatedRoute) {
    this.mode  = (route.snapshot.data['mode'] as SetPasswordMode) ?? 'reset';
    this.token = route.snapshot.queryParamMap.get('token');

    this.prefilledUsername = route.snapshot.queryParamMap.get('username') ?? '';
    this.prefilledEmail    = route.snapshot.queryParamMap.get('email')    ?? '';
    this.prefilledRole     = (route.snapshot.queryParamMap.get('role') ?? '').toUpperCase();
    this.roleMeta          = ROLE_META[this.prefilledRole] ?? { desc: '', badgeClass: 'admin' };

    if (!this.token) {
      this.errorMessage.set('Lien invalide : le jeton est manquant.');
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit() || !this.token) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      if (this.mode === 'activate') {
        await this.auth.activateAccount(this.token, this.password());
      } else {
        await this.auth.resetPassword(this.token, this.password());
      }
      this.success.set(true);
    } catch {
      this.errorMessage.set(
        'Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis la page de connexion.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
