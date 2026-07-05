import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';

/**
 * Écran MB-08 / 13 — Rapports & exports. En attente backend (endpoints
 * d'export PDF mensuel / CSV factures-paiements / bilan impayés). Placeholder.
 */
@Component({
  selector: 'app-rapports-list',
  standalone: true,
  imports: [TranslatePipe, PageTopbarComponent],
  template: `
    <app-page-topbar [title]="'RAPPORTS.TITLE' | translate" [subtitle]="'RAPPORTS.SUBTITLE' | translate" />

    <div class="cs">
      <div class="cs__card">
        <div class="cs__icon"><i class="pi pi-chart-bar"></i></div>
        <span class="cs__badge">{{ 'RAPPORTS.SOON' | translate }}</span>
        <div class="cs__title">{{ 'RAPPORTS.CS_TITLE' | translate }}</div>
        <p class="cs__desc">{{ 'RAPPORTS.CS_DESC' | translate }}</p>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .cs { padding: 40px 24px; display: flex; justify-content: center; }
      .cs__card { max-width: 460px; text-align: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 32px; }
      .cs__icon { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 16px; background: #eff6ff; color: #1a56db; display: flex; align-items: center; justify-content: center; font-size: 28px; }
      .cs__badge { display: inline-block; background: #eff6ff; color: #1a56db; font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px; }
      .cs__title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
      .cs__desc { font-size: 13px; color: #64748b; line-height: 1.6; margin: 0; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RapportsListComponent {}
