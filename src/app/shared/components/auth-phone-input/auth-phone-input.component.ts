import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { isValidCameroonPhone } from '../../utils/phone.utils';

@Component({
  selector: 'app-auth-phone-input',
  imports: [FormsModule, InputTextModule],
  templateUrl: './auth-phone-input.component.html',
  styleUrl: './auth-phone-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPhoneInputComponent {
  readonly value = model('');
  readonly inputId = input('phone');
  readonly name = input('phone');

  readonly isValid = computed(() => isValidCameroonPhone(this.value().trim()));
  readonly showError = computed(() => this.value().trim().length > 0 && !this.isValid());
}
