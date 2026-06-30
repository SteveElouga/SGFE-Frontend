import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-mobile-nav',
  imports: [RouterLink],
  templateUrl: './auth-mobile-nav.component.html',
  styleUrl: './auth-mobile-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthMobileNavComponent {
  readonly title = input.required<string>();
  readonly backTo = input('/login');
}
