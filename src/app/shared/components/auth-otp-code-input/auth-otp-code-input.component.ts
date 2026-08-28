import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-auth-otp-code-input',
  imports: [FormsModule, InputTextModule, TranslatePipe],
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
      [attr.aria-label]="'A11Y.CODE_OTP' | translate"
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
