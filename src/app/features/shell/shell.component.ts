import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AbonnesService } from '../../core/abonnes/abonnes.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { BottomTabsComponent } from '../../shared/components/bottom-tabs/bottom-tabs.component';
import { LayoutService } from '../../shared/services/layout.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SidebarComponent, BottomTabsComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly layout = inject(LayoutService);

  constructor() {
    inject(AbonnesService).startCacheSync();

    // Referme le tiroir mobile à chaque navigation.
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.layout.closeMenu());
  }
}
