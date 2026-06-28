import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthMobileNavComponent } from '../../../shared/components/auth-mobile-nav/auth-mobile-nav.component';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) {
    return email;
  }
  const visible = local.slice(0, local.length > 2 ? 3 : 1);
  return `${visible}•••@${domain}`;
}

@Component({
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    AuthBrandPanelComponent,
    AuthMobileNavComponent,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  readonly email = signal('');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canSubmit = computed(() => this.email().trim().length > 0 && !this.loading());
  readonly maskedEmail = computed(() => maskEmail(this.email().trim()));

  constructor(private readonly auth: AuthService) {}

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.auth.requestPasswordReset(this.email().trim());
      this.submitted.set(true);
    } catch {
      this.errorMessage.set('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      this.loading.set(false);
    }
  }
}
