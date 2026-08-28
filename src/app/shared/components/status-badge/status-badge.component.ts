import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { BadgeComponent, BadgeTone } from '../badge/badge.component';

export type BadgeStatus = 'ACTIF' | 'SUSPENDU' | 'RESILIE' | 'ACTIVE' | 'INACTIVE';

/**
 * Teinte de chaque statut. C'est la seule chose que ce composant décide.
 */
const TONS: Record<BadgeStatus, BadgeTone> = {
  ACTIF: 'success',
  ACTIVE: 'success',
  SUSPENDU: 'warning',
  INACTIVE: 'warning',
  RESILIE: 'danger',
};

/**
 * Pastille de statut d'abonné ou de compte.
 *
 * L'inventaire des composants la marquait « à trancher » : deux composants pour
 * un même rôle, `badge` servant six écrans et celui-ci un seul. Deux choses la
 * sauvent, une la condamnait.
 *
 * Ce qui la sauve : elle traduit un statut du domaine en teinte, et elle porte
 * l'infobulle qui explique ce que ce statut veut dire. « Accès temporairement
 * bloqué — le contrat est toujours actif » n'est pas de la décoration : c'est
 * la différence entre suspendu et résilié, et personne ne la devine.
 *
 * Ce qui la condamnait : elle **redéclarait `.badge`** dans sa propre feuille,
 * avec d'autres valeurs — `--rayon-sm` au lieu de `--badge-rayon`, un poids et
 * un interlettrage écrits en dur — dans un dépôt dont `badge.component.scss`
 * s'annonce comme « la référence unique du badge de statut ». Et ses libellés
 * comme ses infobulles étaient du français figé dans le TypeScript, hors
 * traduction.
 *
 * Elle ne dessine donc plus rien : elle compose `app-badge`, ne garde que la
 * correspondance statut → teinte, et passe par les clés `STATUT_BADGE.*`.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [BadgeComponent, TooltipDirective, TranslatePipe],
  template: `
    <span [appTooltip]="'STATUT_BADGE.' + status() + '_AIDE' | translate">
      <app-badge [label]="'STATUT_BADGE.' + status() | translate" [tone]="ton()" />
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<BadgeStatus>();

  readonly ton = computed<BadgeTone>(() => TONS[this.status()] ?? 'neutral');
}
