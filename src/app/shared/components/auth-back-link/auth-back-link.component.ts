import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-back-link',
  imports: [RouterLink],
  templateUrl: './auth-back-link.component.html',
  styleUrl: './auth-back-link.component.scss',
  host: {
    '[class.auth-back-link--desktop-only]': 'desktopOnly()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBackLinkComponent {
  readonly to = input('/login');
  readonly label = input('Retour à la connexion');
  readonly desktopOnly = input(false);
}
