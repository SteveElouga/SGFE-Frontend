import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { AuthFieldComponent } from '../auth-field/auth-field.component';

@Component({
  selector: 'app-auth-password-pair',
  imports: [FormsModule, PasswordModule, AuthFieldComponent],
  templateUrl: './auth-password-pair.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPasswordPairComponent {
  readonly password = model('');
  readonly confirmPassword = model('');

  readonly newPasswordLabel = input('Nouveau mot de passe *');
  readonly confirmPasswordLabel = input('Confirmer le mot de passe *');
  readonly newPasswordId = input('new-password');
  readonly confirmPasswordId = input('confirm-password');

  readonly passwordsMatch = computed(
    () => this.password() === this.confirmPassword() || this.confirmPassword().length === 0,
  );

  /** True when both fields are filled, match, and meet minimum length. */
  readonly isValid = computed(
    () => this.password().length >= 8 && this.password() === this.confirmPassword(),
  );
}
