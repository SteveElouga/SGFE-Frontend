import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-auth-otp-resend',
  templateUrl: './auth-otp-resend.component.html',
  styleUrl: './auth-otp-resend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthOtpResendComponent {
  readonly cooldownDisplay = input<string | null>(null);
  readonly loading = input(false);
  readonly countdownPrefix = input('Code expiré dans');
  readonly resendLabel = input('Renvoyer le code');
  readonly resend = output<void>();
}
