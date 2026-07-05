import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';

/**
 * Écran 23 — Suivi des envois WhatsApp. En attente backend (pas de requête
 * globale des envois, ni d'ID message / type exposés). Placeholder « à venir ».
 */
@Component({
  selector: 'app-envois-list',
  standalone: true,
  imports: [TranslatePipe, PageTopbarComponent],
  template: `
    <app-page-topbar [title]="'ENVOIS.TITLE' | translate" [subtitle]="'ENVOIS.SUBTITLE' | translate" />

    <div class="envois-cs">
      <div class="envois-cs__card">
        <div class="envois-cs__icon"><i class="pi pi-whatsapp"></i></div>
        <span class="envois-cs__badge">{{ 'ENVOIS.SOON' | translate }}</span>
        <div class="envois-cs__title">{{ 'ENVOIS.CS_TITLE' | translate }}</div>
        <p class="envois-cs__desc">{{ 'ENVOIS.CS_DESC' | translate }}</p>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .envois-cs {
        padding: 40px 24px;
        display: flex;
        justify-content: center;
      }
      .envois-cs__card {
        max-width: 460px;
        text-align: center;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 36px 32px;
      }
      .envois-cs__icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 16px;
        border-radius: 16px;
        background: #f0fdf4;
        color: #0e9f6e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
      }
      .envois-cs__badge {
        display: inline-block;
        background: #eff6ff;
        color: #1a56db;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 20px;
        margin-bottom: 12px;
      }
      .envois-cs__title {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 8px;
      }
      .envois-cs__desc {
        font-size: 13px;
        color: #64748b;
        line-height: 1.6;
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvoisListComponent {}
