import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthMobileNavComponent } from '../../../shared/components/auth-mobile-nav/auth-mobile-nav.component';

export type SetPasswordMode = 'activate' | 'reset';

const MIN_PASSWORD_LENGTH = 8;

const COPY: Record<SetPasswordMode, { title: string; subtitle: string; submitLabel: string }> = {
  activate: {
    title: 'Créer votre mot de passe',
    subtitle: 'Définissez le mot de passe de votre nouveau compte AquaBill.',
    submitLabel: 'Activer mon compte',
  },
  reset: {
    title: 'Réinitialiser votre mot de passe',
    subtitle: 'Choisissez un nouveau mot de passe pour votre compte.',
    submitLabel: 'Réinitialiser le mot de passe',
  },
};

@Component({
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    PasswordModule,
    MessageModule,
    AuthBrandPanelComponent,
    AuthMobileNavComponent,
  ],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.scss',
})
export class SetPasswordComponent {
  private readonly mode: SetPasswordMode;
  private readonly token: string | null;

  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly copy: (typeof COPY)[SetPasswordMode];

  readonly passwordsMatch = computed(
    () => this.password() === this.confirmPassword() || this.confirmPassword().length === 0,
  );

  readonly canSubmit = computed(
    () =>
      !this.loading() &&
      !!this.token &&
      this.password().length >= MIN_PASSWORD_LENGTH &&
      this.password() === this.confirmPassword(),
  );

  readonly auth = inject(AuthService);

  constructor(route: ActivatedRoute) {
    this.mode = (route.snapshot.data['mode'] as SetPasswordMode) ?? 'reset';
    this.token = route.snapshot.queryParamMap.get('token');
    this.copy = COPY[this.mode];

    if (!this.token) {
      this.errorMessage.set('Lien invalide : le jeton est manquant.');
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit() || !this.token) {
      return;
    }

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
