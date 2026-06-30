import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-auth-otp-code-input',
  imports: [FormsModule, InputTextModule],
  template: `
    <input
      [id]="inputId()"
      type="text"
      pInputText
      [fluid]="true"
      inputmode="numeric"
      autocomplete="one-time-code"
      placeholder="123456"
      maxlength="6"
      aria-label="Code OTP"
      class="auth-otp-code-input"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      [name]="name()"
    />
  `,
  styles: [`
    .auth-otp-code-input {
      letter-spacing: 0.35em;
      font-size: 20px;
      font-weight: 600;
      text-align: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthOtpCodeInputComponent {
  readonly value = model('');
  readonly inputId = input('otp');
  readonly name = input('otp');
}
