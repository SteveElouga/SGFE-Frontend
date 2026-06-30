import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeStatus = 'ACTIF' | 'SUSPENDU' | 'RESILIE' | 'ACTIVE' | 'INACTIVE';

const LABELS: Record<BadgeStatus, string> = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
  RESILIE: 'Résilié',
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<BadgeStatus>();

  readonly label = computed(() => LABELS[this.status()] ?? this.status());
  readonly modifier = computed(() => this.status().toLowerCase());
}
