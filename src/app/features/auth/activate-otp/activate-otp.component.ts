import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, extractGqlError } from '../../../core/auth/auth.service';
import { AuthBrandPanelComponent } from '../../../shared/components/auth-brand-panel/auth-brand-panel.component';
import { AuthMobileNavComponent } from '../../../shared/components/auth-mobile-nav/auth-mobile-nav.component';
import { AuthFieldComponent } from '../../../shared/components/auth-field/auth-field.component';
import { AuthErrorMessageComponent } from '../../../shared/components/auth-error-message/auth-error-message.component';
import { AuthSubmitButtonComponent } from '../../../shared/components/auth-submit-button/auth-submit-button.component';
import { AuthSuccessHeaderComponent } from '../../../shared/components/auth-success-header/auth-success-header.component';
import { AuthPhoneInputComponent } from '../../../shared/components/auth-phone-input/auth-phone-input.component';
import { AuthOtpCodeInputComponent } from '../../../shared/components/auth-otp-code-input/auth-otp-code-input.component';
import { AuthOtpResendComponent } from '../../../shared/components/auth-otp-resend/auth-otp-resend.component';
import { AuthPasswordPairComponent } from '../../../shared/components/auth-password-pair/auth-password-pair.component';
import { createCooldown } from '../../../shared/utils/otp.utils';
import { isValidCameroonPhone, maskPhone, normalizePhone, toLocalPhone } from '../../../shared/utils/phone.utils';

const OTP_VALIDITY_SECONDS = 600; // 10 minutes

@Component({
  selector: 'app-activate-otp',
  imports: [
    RouterLink,
    FormsModule,
    AuthBrandPanelComponent,
    AuthMobileNavComponent,
    AuthFieldComponent,
    AuthErrorMessageComponent,
    AuthSubmitButtonComponent,
    AuthSuccessHeaderComponent,
    AuthPhoneInputComponent,
    AuthOtpCodeInputComponent,
    AuthOtpResendComponent,
    AuthPasswordPairComponent,
  ],
  templateUrl: './activate-otp.component.html',
  styleUrl: './activate-otp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivateOtpComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly cooldown = createCooldown(OTP_VALIDITY_SECONDS);

  readonly phone = signal('');
  readonly otpCode = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly resendCooldown = this.cooldown.resendCooldown;
  readonly cooldownDisplay = this.cooldown.cooldownDisplay;

  readonly isPhoneValid = computed(() => isValidCameroonPhone(this.phone().trim()));
  readonly canSubmit = computed(
    () =>
      this.isPhoneValid() &&
      /^\d{6}$/.test(this.otpCode()) &&
      this.password().length >= 8 &&
      this.password() === this.confirmPassword() &&
      !this.loading(),
  );

  readonly normalizedPhone = computed(() => normalizePhone(this.phone().trim()));
  readonly maskedPhone = computed(() => maskPhone(this.normalizedPhone()));

  hasPhoneParam = false;

  constructor(route: ActivatedRoute) {
    const phone = route.snapshot.queryParamMap.get('phone');
    if (phone) {
      this.hasPhoneParam = true;
      this.phone.set(toLocalPhone(phone));
    }
    // OTP was sent by the backend when the admin created the account
    this.cooldown.startCooldown();
  }

  async onResend(): Promise<void> {
    if (this.resendCooldown() > 0 || this.loading()) return;
    this.loading.set(true);
    try {
      await this.auth.requestPhoneOtp(this.normalizedPhone());
      this.cooldown.startCooldown();
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      this.errorMessage.set(
        code === 'SERVICE_UNAVAILABLE'
          ? "Échec de l'envoi WhatsApp. Réessayez dans quelques instants."
          : message || 'Impossible de renvoyer le code. Réessayez.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.verifyOtpAndSetPassword(
        this.normalizedPhone(),
        this.otpCode(),
        this.password(),
      );
      this.submitted.set(true);
    } catch (error: unknown) {
      const { code, message } = extractGqlError(error);
      let errMsg: string;
      if (code === 'UNAUTHENTICATED') {
        errMsg = message || 'Code incorrect ou expiré. Vérifiez le code reçu par WhatsApp.';
      } else if (code === 'SERVICE_UNAVAILABLE') {
        errMsg = 'Erreur temporaire. Réessayez dans quelques instants.';
      } else {
        errMsg = message || 'Une erreur est survenue. Veuillez réessayer.';
      }
      this.errorMessage.set(errMsg);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.cooldown.destroy();
  }
}
