import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WhatsappSurveillanceService } from '../whatsapp-surveillance.service';

/**
 * Bandeau permanent, visible depuis n'importe quel écran de l'application
 * (posé dans `ShellComponent`, pas seulement sur la page Configuration où
 * vit `WhatsappLinkComponent`) — tant que la liaison WhatsApp reste rompue,
 * un admin ne doit pas avoir à ouvrir Configuration pour s'en rendre compte.
 *
 * Complète, sans le remplacer, le rappel actif de
 * `WhatsappSurveillanceService` (toast répété toutes les 10 minutes) : le
 * toast attire l'œil au moment de la bascule, ce bandeau reste visible en
 * continu pour quiconque revient sur l'écran entre deux rappels.
 */
@Component({
  selector: 'app-whatsapp-banner',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './whatsapp-banner.component.html',
  styleUrl: './whatsapp-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappBannerComponent {
  private readonly surveillance = inject(WhatsappSurveillanceService);

  readonly rompu = this.surveillance.rompu;
  readonly depuis = this.surveillance.depuis;
}
