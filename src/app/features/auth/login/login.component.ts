import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../shared/models/user.model';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';

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
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PasswordModule,
    MessageModule,
    AuthBrandPanelComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly username = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canSubmit = computed(
    () => this.username().trim().length > 0 && this.password().length > 0 && !this.loading(),
  );

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.auth.login(this.username().trim(), this.password());
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
