import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Écrans M-06 / MB-10 / 06 / 25 — Espace abonné public (accès par lien WhatsApp
 * tokenisé, sans authentification). En attente backend (requête d'accès par
 * token). Page publique autonome : topbar sombre AquaBill + placeholder.
 */
@Component({
  selector: 'app-espace-abonne',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="ea">
      <header class="ea__topbar">
        <div class="ea__brand">
          <svg width="22" height="22" viewBox="0 0 38 38" fill="none" aria-hidden="true">
            <path d="M19 3C19 3 8 15.5 8 23C8 30.18 13.04 34 19 34C24.96 34 30 30.18 30 23C30 15.5 19 3 19 3Z" fill="white" fill-opacity=".95"/>
            <path d="M19 16C19 16 14 21.5 14 25C14 27.76 16.24 30 19 30C21.76 30 24 27.76 24 25C24 21.5 19 16 19 16Z" fill="#0e9f6e" fill-opacity=".85"/>
          </svg>
          <span class="ea__brand-name">AquaBill</span>
          <span class="ea__brand-sub">· {{ 'ESPACE.TITLE' | translate }}</span>
        </div>
      </header>

      <main class="ea__body">
        <div class="ea__card">
          <div class="ea__icon"><i class="pi pi-file"></i></div>
          <span class="ea__badge">{{ 'ESPACE.SOON' | translate }}</span>
          <div class="ea__title">{{ 'ESPACE.CS_TITLE' | translate }}</div>
          <p class="ea__desc">{{ 'ESPACE.CS_DESC' | translate }}</p>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100dvh; }
      .ea { min-height: 100dvh; background: #f1f5f9; display: flex; flex-direction: column; }
      .ea__topbar { height: 52px; background: #0f1c3d; padding: 0 20px; display: flex; align-items: center; }
      .ea__brand { display: flex; align-items: center; gap: 9px; }
      .ea__brand-name { font-size: 15px; font-weight: 700; color: #fff; }
      .ea__brand-sub { font-size: 11px; color: rgba(255, 255, 255, 0.45); }
      .ea__body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px 16px; }
      .ea__card { width: 440px; max-width: 100%; text-align: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 40px rgba(15, 37, 87, 0.08); padding: 36px 32px; }
      .ea__icon { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 16px; background: #eff6ff; color: #1a56db; display: flex; align-items: center; justify-content: center; font-size: 28px; }
      .ea__badge { display: inline-block; background: #eff6ff; color: #1a56db; font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px; }
      .ea__title { font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
      .ea__desc { font-size: 13px; color: #64748b; line-height: 1.6; margin: 0; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceAbonneComponent {}
