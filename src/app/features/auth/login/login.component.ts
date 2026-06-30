import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../shared/models/user.model';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthFieldComponent } from '../../../shared/components/auth-field/auth-field.component';
import { AuthErrorMessageComponent } from '../../../shared/components/auth-error-message/auth-error-message.component';
import { AuthSubmitButtonComponent } from '../../../shared/components/auth-submit-button/auth-submit-button.component';

const LANDING_ROUTE_BY_ROLE: Record<Role, string> = {
  ADMIN: '/dashboard',
  COMPTABLE: '/dashboard',
  AGENT: '/terrain',
  SUPERVISEUR: '/dashboard',
};

@Component({
  imports: [
    FormsModule,
    RouterLink,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PasswordModule,
    AuthBrandPanelComponent,
    AuthFieldComponent,
    AuthErrorMessageComponent,
    AuthSubmitButtonComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly checklist = [
    'Relevés terrain sur mobile (PWA)',
    'Facturation et envoi WhatsApp auto',
    'Suivi des impayés en temps réel',
  ];

  readonly identifier = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly identifierTouched = signal(false);
  readonly passwordTouched = signal(false);

  readonly identifierInvalid = computed(
    () => this.identifierTouched() && !this.identifier().trim(),
  );
  readonly passwordInvalid = computed(
    () => this.passwordTouched() && !this.password(),
  );

  readonly identifierIconClass = computed(() => {
    if (this.identifierInvalid() || !!this.errorMessage()) return 'pi pi-user login__icon--invalid';
    if (this.identifierTouched() && this.identifier().trim()) return 'pi pi-user login__icon--valid';
    return 'pi pi-user';
  });

  readonly lockIconClass = computed(() => {
    if (this.passwordInvalid() || !!this.errorMessage()) return 'pi pi-lock login__icon--invalid';
    if (this.passwordTouched() && this.password()) return 'pi pi-lock login__icon--valid';
    return 'pi pi-lock';
  });

  readonly auth = inject(AuthService);
  readonly router = inject(Router);

  readonly canSubmit = computed(
    () => this.identifier().trim().length > 0 && this.password().length > 0 && !this.loading(),
  );

  async onSubmit(): Promise<void> {
    this.identifierTouched.set(true);
    this.passwordTouched.set(true);
    if (!this.canSubmit()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.auth.login(this.identifier().trim(), this.password());
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Identifiants incorrects. Veuillez réessayer.',
      );
      this.loading.set(false);
      return;
    }

    this.loading.set(false);
    const role = this.auth.role();
    await this.router.navigateByUrl(role ? LANDING_ROUTE_BY_ROLE[role] : '/login');
  }
}
