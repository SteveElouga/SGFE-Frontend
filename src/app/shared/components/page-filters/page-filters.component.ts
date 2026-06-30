import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-page-filters',
  standalone: true,
  template: `
    <div class="page-filters">
      <ng-content />
    </div>
  `,
  styleUrl: './page-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageFiltersComponent {}
