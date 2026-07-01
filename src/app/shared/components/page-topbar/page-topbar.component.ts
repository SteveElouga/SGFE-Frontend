import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="page-topbar">
      <div class="page-topbar__left">
        @if (backLink()) {
          <a class="page-topbar__back" [routerLink]="backLink()">← {{ backLabel() }}</a>
          <span class="page-topbar__sep">/</span>
        }
        <span class="page-topbar__title">{{ title() }}</span>
        @if (subtitle()) {
          <span class="page-topbar__subtitle">{{ subtitle() }}</span>
        }
      </div>
      <ng-content />
    </header>
  `,
  styleUrl: './page-topbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None pour que .page-topbar-action (projeté depuis le parent)
  // hérite des styles définis dans ce composant sans ::ng-deep
  encapsulation: ViewEncapsulation.None,
})
export class PageTopbarComponent {
  title = input.required<string>();
  subtitle = input<string>('');
  backLink = input<string>('');
  backLabel = input<string>('');
}
