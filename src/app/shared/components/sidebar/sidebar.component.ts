import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { UserMenuComponent } from '../user-menu/user-menu.component';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CampagneActive, formatPeriodeCampagne } from '../../models/campagne.model';
import { GET_CAMPAGNE_ACTIVE } from '../../../graphql/queries/campagnes.queries';
import { Role } from '../../models/user.model';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: Role[];
  badge?: number | null;
  disabled?: boolean;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, UserMenuComponent, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthService);

  private readonly role = this.auth.role;

  readonly campagneActive = signal<CampagneActive | null>(null);

  readonly campagnePeriode = computed(() => {
    const c = this.campagneActive();
    return c ? formatPeriodeCampagne(c.periodeMois, c.periodeAnnee) : '';
  });

  readonly campagneProgression = computed(() => {
    const c = this.campagneActive();
    if (!c) return null;
    return {
      pourcentage: Math.round(c.pourcentage),
      label: `${Math.round(c.pourcentage)}% · ${c.nbReleves}/${c.totalAbonnes} relevés`,
    };
  });

  readonly navItems: NavItem[] = [
    { label: 'NAV.DASHBOARD', icon: 'pi-th-large', route: '/dashboard' },
    { label: 'NAV.ABONNES', icon: 'pi-users', route: '/abonnes', roles: ['ADMIN'] },
    { label: 'NAV.CAMPAGNES', icon: 'pi-calendar', route: '/campagnes', disabled: true },
    { label: 'NAV.FACTURES', icon: 'pi-file', route: '/factures', disabled: true },
    { label: 'NAV.PAIEMENTS', icon: 'pi-credit-card', route: '/paiements', disabled: true },
    { label: 'NAV.IMPAYES', icon: 'pi-exclamation-triangle', route: '/impayes', disabled: true },
    { label: 'NAV.CONFIGURATION', icon: 'pi-cog', route: '/configuration', roles: ['ADMIN'] },
  ];

  readonly visibleNavItems = computed(() =>
    this.navItems.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(this.role() as Role);
    }),
  );

  ngOnInit(): void {
    this.loadCampagneActive();
  }

  private async loadCampagneActive(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apollo.query<{ campagneActive: CampagneActive | null }>({
          query: GET_CAMPAGNE_ACTIVE,
          fetchPolicy: 'network-only',
        }),
      );
      this.campagneActive.set(result.data?.campagneActive ?? null);
    } catch {
      // Sidebar continues to work without campaign data
    }
  }

}
