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
import { Campagne, Progression, formatPeriodeCampagne } from '../../models/campagne.model';
import {
  GET_CAMPAGNE_ACTIVE,
  GET_PROGRESSION,
} from '../../../graphql/queries/campagnes.queries';
import { Role } from '../../models/user.model';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: Role[];
  badge?: number | null;
  disabled?: boolean;
}

interface SidebarCampagne {
  campagneId: string;
  periodeMois: number;
  periodeAnnee: number;
  progression: Progression;
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

  readonly campagneActive = signal<SidebarCampagne | null>(null);

  readonly campagnePeriode = computed(() => {
    const c = this.campagneActive();
    return c ? formatPeriodeCampagne(c.periodeMois, c.periodeAnnee) : '';
  });

  readonly campagneProgression = computed(() => {
    const c = this.campagneActive();
    if (!c) return null;
    const p = c.progression;
    return {
      pourcentage: Math.round(p.pourcentage),
      label: `${Math.round(p.pourcentage)}% · ${p.nbReleves}/${p.totalAbonnes} relevés`,
    };
  });

  readonly navItems: NavItem[] = [
    { label: 'NAV.DASHBOARD', icon: 'pi-th-large', route: '/dashboard' },
    { label: 'NAV.ABONNES', icon: 'pi-users', route: '/abonnes', roles: ['ADMIN'] },
    { label: 'NAV.CAMPAGNES', icon: 'pi-calendar', route: '/campagnes', roles: ['ADMIN', 'SUPERVISEUR', 'AGENT'] },
    { label: 'NAV.FACTURES', icon: 'pi-file', route: '/factures', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.PAIEMENTS', icon: 'pi-credit-card', route: '/paiements', roles: ['ADMIN', 'COMPTABLE'] },
    { label: 'NAV.IMPAYES', icon: 'pi-exclamation-triangle', route: '/impayes', roles: ['ADMIN', 'COMPTABLE'] },
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
        this.apollo.query<{ campagnes: Pick<Campagne, 'campagneId' | 'periodeMois' | 'periodeAnnee' | 'statut'>[] }>({
          query: GET_CAMPAGNE_ACTIVE,
          context: { silentError: true },
        }),
      );
      const enCours = result.data?.campagnes?.find((c) => c.statut === 'EN_COURS');
      if (!enCours) return;

      const progResult = await firstValueFrom(
        this.apollo.query<{ progression: Progression }>({
          query: GET_PROGRESSION,
          variables: { campagneId: enCours.campagneId },
          fetchPolicy: 'network-only',
          context: { silentError: true },
        }),
      );
      this.campagneActive.set({
        campagneId: enCours.campagneId,
        periodeMois: enCours.periodeMois,
        periodeAnnee: enCours.periodeAnnee,
        progression: progResult.data!.progression,
      });
    } catch {
      // La sidebar reste fonctionnelle sans le widget campagne
    }
  }
}
