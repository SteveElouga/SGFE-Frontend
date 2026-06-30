import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TooltipDirective } from '../../directives/tooltip.directive';

export type BadgeStatus = 'ACTIF' | 'SUSPENDU' | 'RESILIE' | 'ACTIVE' | 'INACTIVE';

const LABELS: Record<BadgeStatus, string> = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
  RESILIE: 'Résilié',
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
};

const TOOLTIPS: Record<BadgeStatus, string> = {
  ACTIF: 'Abonnement actif — l\'abonné reçoit ses factures normalement',
  SUSPENDU: 'Accès temporairement bloqué — le contrat est toujours actif',
  RESILIE: 'Contrat résilié définitivement',
  ACTIVE: 'Compte actif — l\'utilisateur peut se connecter',
  INACTIVE: 'Compte désactivé — connexion impossible',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<BadgeStatus>();

  readonly label = computed(() => LABELS[this.status()] ?? this.status());
  readonly modifier = computed(() => this.status().toLowerCase());
  readonly tooltip = computed(() => TOOLTIPS[this.status()] ?? '');
}
