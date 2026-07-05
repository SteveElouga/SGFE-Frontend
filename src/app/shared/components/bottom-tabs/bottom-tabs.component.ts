import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NavService } from '../../services/nav.service';
import { LayoutService } from '../../services/layout.service';

/**
 * Barre d'onglets du bas (mobile only). Affiche les 4 sections les plus
 * visitées du rôle courant + un onglet « Plus » qui ouvre le tiroir complet.
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
  protected readonly layout = inject(LayoutService);
}
