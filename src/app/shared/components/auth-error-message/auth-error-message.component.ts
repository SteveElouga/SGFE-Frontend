import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-error-message',
  templateUrl: './auth-error-message.component.html',
  styleUrl: './auth-error-message.component.scss',
  host: {
    '[style.display]': 'text() ? "flex" : "none"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthErrorMessageComponent {
  readonly text = input<string | null>(null);
}
