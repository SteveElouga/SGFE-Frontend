import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NavService } from '../../services/nav.service';

/**
 * Barre d'onglets du bas (mobile only). Affiche les onglets métier du rôle
 * courant (maquettes M-04/M-05, max 5) ; le tiroir complet s'ouvre via
 * l'avatar de la topbar.
 */
@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './bottom-tabs.component.html',
  styleUrl: './bottom-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomTabsComponent {
  protected readonly nav = inject(NavService);
}
