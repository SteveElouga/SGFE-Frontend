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
import { LayoutService } from '../../services/layout.service';
import { NavService } from '../../services/nav.service';
import { Campagne, Progression, formatPeriodeCampagne } from '../../models/campagne.model';
import {
  GET_CAMPAGNE_ACTIVE,
  GET_PROGRESSION,
} from '../../../graphql/queries/campagnes.queries';

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
  protected readonly layout = inject(LayoutService);
  protected readonly nav = inject(NavService);

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
