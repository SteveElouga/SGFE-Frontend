import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-auth-brand-panel',
  imports: [TranslatePipe],
  templateUrl: './auth-brand-panel.component.html',
  styleUrl: './auth-brand-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBrandPanelComponent {}
