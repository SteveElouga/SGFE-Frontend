import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import { createCooldown } from '../../../shared/utils/otp.utils';
import { normalizePhone } from '../../../shared/utils/phone.utils';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthMobileNavComponent } from '../../../shared/components/auth-mobile-nav/auth-mobile-nav.component';
import { AuthBackLinkComponent } from '../../../shared/components/auth-back-link/auth-back-link.component';
import { AuthFieldComponent } from '../../../shared/components/auth-field/auth-field.component';
import { AuthErrorMessageComponent } from '../../../shared/components/auth-error-message/auth-error-message.component';
import { AuthSubmitButtonComponent } from '../../../shared/components/auth-submit-button/auth-submit-button.component';
import { AuthSuccessHeaderComponent } from '../../../shared/components/auth-success-header/auth-success-header.component';
import { AuthPhoneInputComponent } from '../../../shared/components/auth-phone-input/auth-phone-input.component';
import { AuthOtpCodeInputComponent } from '../../../shared/components/auth-otp-code-input/auth-otp-code-input.component';
import { AuthOtpResendComponent } from '../../../shared/components/auth-otp-resend/auth-otp-resend.component';
import { AuthPasswordPairComponent } from '../../../shared/components/auth-password-pair/auth-password-pair.component';
import { AuthStepsCardComponent, StepDef } from '../../../shared/components/auth-steps-card/auth-steps-card.component';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, local.length > 2 ? 3 : 1);
  return `${visible}···@${domain}`;
}

@Component({
  imports: [
    TranslatePipe,
    FormsModule,
    RouterLink,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    AuthBrandPanelComponent,
    AuthMobileNavComponent,
    AuthBackLinkComponent,
    AuthFieldComponent,
    AuthErrorMessageComponent,
    AuthSubmitButtonComponent,
    AuthSuccessHeaderComponent,
    AuthPhoneInputComponent,
    AuthOtpCodeInputComponent,
    AuthOtpResendComponent,
    AuthPasswordPairComponent,
    AuthStepsCardComponent,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly cooldown = createCooldown(600);

  // ── Tab ──────────────────────────────────────────────────────────────────
  readonly activeTab = signal<'email' | 'whatsapp'>('whatsapp');

  switchTab(tab: 'email' | 'whatsapp'): void {
    this.activeTab.set(tab);
  }

  // ── Shared ───────────────────────────────────────────────────────────────
  readonly loading = signal(false);

  // ── Email flow ───────────────────────────────────────────────────────────
  readonly email = signal('');
  readonly emailSubmitted = signal(false);
  readonly emailErrorType = signal<null | 'generic'>(null);

  readonly maskedEmail = computed(() => maskEmail(this.email().trim()));
  readonly isEmailValid = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim()),
  );
  readonly canSubmitEmail = computed(() => this.isEmailValid() && !this.loading());

  async onSubmitEmail(): Promise<void> {
    if (!this.canSubmitEmail()) return;
    this.loading.set(true);
    this.emailErrorType.set(null);
    try {
      await this.auth.requestPasswordReset(this.email().trim());
      this.emailSubmitted.set(true);
    } catch {
      this.emailErrorType.set('generic');
    } finally {
      this.loading.set(false);
    }
  }

  // ── WhatsApp flow ─────────────────────────────────────────────────────────
  readonly phone = signal('');
  readonly whatsappStep = signal<'phone' | 'otp'>('phone');
  readonly otpCode = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly whatsappSubmitted = signal(false);
  readonly whatsappError = signal<string | null>(null);
  readonly backendMaskedPhone = signal('');

  readonly normalizedPhone = computed(() => normalizePhone(this.phone().trim()));
  readonly resendCooldown = this.cooldown.resendCooldown;
  readonly cooldownDisplay = this.cooldown.cooldownDisplay;

  readonly currentStep = computed(() => {
    if (this.whatsappSubmitted()) return 3;
    if (this.whatsappStep() === 'otp') return 2;
    return 1;
  });

  readonly stepsForCard: StepDef[] = [
    { label: 'Entrez votre numéro WhatsApp' },
    { label: 'Vérifiez le code OTP reçu' },
    { label: 'Définissez votre nouveau mot de passe' },
  ];

  readonly canSubmitPhone = computed(
    () => this.phone().trim().length > 0 && !this.loading(),
  );
  readonly canSubmitOtp = computed(
    () =>
      /^\d{6}$/.test(this.otpCode()) &&
      this.newPassword().length >= 8 &&
      this.newPassword() === this.confirmPassword() &&
      !this.loading(),
  );

  async onSubmitPhone(): Promise<void> {
    if (!this.canSubmitPhone()) return;
    this.loading.set(true);
    this.whatsappError.set(null);
    try {
      const maskedPhone = await this.auth.requestPhoneOtp(this.normalizedPhone());
      this.backendMaskedPhone.set(maskedPhone);
      this.whatsappStep.set('otp');
      this.cooldown.startCooldown();
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      this.whatsappError.set(
        code === 'SERVICE_UNAVAILABLE'
          ? "Échec de l'envoi WhatsApp. Réessayez dans quelques instants."
          : message || "Impossible d'envoyer le code. Vérifiez le numéro et réessayez.",
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onResendOtp(): Promise<void> {
    if (this.resendCooldown() > 0 || this.loading()) return;
    this.loading.set(true);
    try {
      const maskedPhone = await this.auth.requestPhoneOtp(this.normalizedPhone());
      this.backendMaskedPhone.set(maskedPhone);
      this.cooldown.startCooldown();
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      this.whatsappError.set(
        code === 'SERVICE_UNAVAILABLE'
          ? "Échec de l'envoi WhatsApp. Réessayez dans quelques instants."
          : message || 'Impossible de renvoyer le code. Réessayez.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmitOtp(): Promise<void> {
    if (!this.canSubmitOtp()) return;
    this.loading.set(true);
    this.whatsappError.set(null);
    try {
      await this.auth.verifyOtpAndSetPassword(
        this.normalizedPhone(),
        this.otpCode(),
        this.newPassword(),
      );
      this.whatsappSubmitted.set(true);
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      this.whatsappError.set(
        code === 'UNAUTHENTICATED'
          ? (message || 'Code incorrect ou expiré. Vérifiez le code reçu par WhatsApp.')
          : code === 'SERVICE_UNAVAILABLE'
          ? 'Erreur temporaire. Réessayez dans quelques instants.'
          : (message || 'Une erreur est survenue. Veuillez réessayer.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.cooldown.destroy();
  }
}
