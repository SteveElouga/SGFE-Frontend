import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Bandeau d'erreur inline réutilisable, avec bouton « Réessayer » optionnel.
 * Émet `(retry)` — le parent relance alors son chargement.
 *
 * ```html
 * <app-error-banner [message]="error()!" (retry)="load()" />
 * ```
 */
@Component({
  selector: 'app-error-banner',
  standalone: true,
  templateUrl: './error-banner.component.html',
  styleUrl: './error-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBannerComponent {
  readonly message = input.required<string>();
  readonly retryLabel = input<string>('Réessayer');
  readonly showRetry = input<boolean>(true);

  readonly retry = output<void>();
}
