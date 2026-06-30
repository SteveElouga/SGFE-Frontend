import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
  imports: [RouterLink, RouterLinkActive, UserMenuComponent],
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
    { label: 'Dashboard', icon: 'pi-th-large', route: '/dashboard' },
    { label: 'Abonnés', icon: 'pi-users', route: '/abonnes', roles: ['ADMIN'] },
    { label: 'Campagnes', icon: 'pi-calendar', route: '/campagnes', disabled: true },
    { label: 'Factures', icon: 'pi-file', route: '/factures', disabled: true },
    { label: 'Paiements', icon: 'pi-credit-card', route: '/paiements', disabled: true },
    { label: 'Impayés', icon: 'pi-exclamation-triangle', route: '/impayes', disabled: true },
    { label: 'Configuration', icon: 'pi-cog', route: '/configuration', roles: ['ADMIN'], disabled: true },
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
