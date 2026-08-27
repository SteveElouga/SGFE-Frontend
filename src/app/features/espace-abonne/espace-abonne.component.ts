import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  EspaceAbonneData,
  EspaceAbonneService,
} from '../../core/espace-abonne/espace-abonne.service';
import { FcfaPipe } from '../../shared/pipes/fcfa.pipe';

type Etat = 'loading' | 'ready' | 'invalid' | 'error';

/**
 * Écrans M-06 / MB-10 / 06 / 25 — Espace abonné PUBLIC (accès par lien WhatsApp
 * tokenisé, sans authentification — aucun authGuard sur la route `espace/:token`).
 *
 * Consultation seule (pas de paiement en ligne, décision d'audit §10.2) : l'abonné
 * voit ses factures, leur statut et son solde, et peut télécharger chaque PDF.
 * Le token du lien porte l'identité ; sa validation et l'anti-IDOR sur le PDF
 * sont côté gateway. Un token invalide/expiré → 401 → état « lien invalide ».
 */
@Component({
  selector: 'app-espace-abonne',
  standalone: true,
  imports: [TranslatePipe, FcfaPipe, DatePipe],
  template: `
    <div class="ea">
      <header class="ea__topbar">
        <div class="ea__brand">
          <svg width="22" height="22" viewBox="0 0 38 38" fill="none" aria-hidden="true">
            <path d="M19 3C19 3 8 15.5 8 23C8 30.18 13.04 34 19 34C24.96 34 30 30.18 30 23C30 15.5 19 3 19 3Z" fill="white" fill-opacity=".95"/>
            <path d="M19 16C19 16 14 21.5 14 25C14 27.76 16.24 30 19 30C21.76 30 24 27.76 24 25C24 21.5 19 16 19 16Z" fill="#0e9f6e" fill-opacity=".85"/>
          </svg>
          <span class="ea__brand-name">SGFE</span>
          <span class="ea__brand-sub">· {{ 'ESPACE.TITLE' | translate }}</span>
        </div>
      </header>

      <main class="ea__body">
        @switch (etat()) {
          @case ('loading') {
            <div class="ea__state" role="status" aria-live="polite">
              <i class="pi pi-spinner pi-spin ea__spinner" aria-hidden="true"></i>
              <p class="ea__state-text">{{ 'ESPACE.LOADING' | translate }}</p>
            </div>
          }

          @case ('invalid') {
            <div class="ea__card ea__card--msg">
              <div class="ea__icon ea__icon--danger"><i class="pi pi-lock" aria-hidden="true"></i></div>
              <div class="ea__title">{{ 'ESPACE.ERR_TITLE' | translate }}</div>
              <p class="ea__desc">{{ 'ESPACE.ERR_DESC' | translate }}</p>
            </div>
          }

          @case ('error') {
            <div class="ea__card ea__card--msg">
              <div class="ea__icon ea__icon--warn"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i></div>
              <div class="ea__title">{{ 'ESPACE.ERR_SERVER_TITLE' | translate }}</div>
              <p class="ea__desc">{{ 'ESPACE.ERR_SERVER_DESC' | translate }}</p>
              <button type="button" class="ea__btn" (click)="charger()">
                <i class="pi pi-refresh" aria-hidden="true"></i> {{ 'ESPACE.RETRY' | translate }}
              </button>
            </div>
          }

          @case ('ready') {
            <div class="ea__content">
              <section class="ea__summary">
                <h1 class="ea__heading">{{ 'ESPACE.HEADING' | translate }}</h1>

                @if (soldeTotal() > 0) {
                  <div class="ea__solde ea__solde--due">
                    <span class="ea__solde-label">{{ 'ESPACE.SOLDE_TOTAL' | translate }}</span>
                    <span class="ea__solde-val">{{ soldeTotal() | fcfa }}</span>
                    <span class="ea__solde-sub">{{ 'ESPACE.FACTURES_A_REGLER' | translate: { n: nbAPayer() } }}</span>
                  </div>
                } @else {
                  <div class="ea__solde ea__solde--ok">
                    <i class="pi pi-check-circle" aria-hidden="true"></i>
                    <span>{{ 'ESPACE.TOUT_PAYE' | translate }}</span>
                  </div>
                }

                @if (data()?.token_expiration) {
                  <p class="ea__expire">
                    <i class="pi pi-clock" aria-hidden="true"></i>
                    {{ 'ESPACE.LIEN_VALIDE_JUSQU' | translate: { date: (data()!.token_expiration | date: 'dd/MM/yyyy') } }}
                  </p>
                }
              </section>

              @if ((data()?.factures ?? []).length === 0) {
                <div class="ea__card ea__card--msg">
                  <div class="ea__icon"><i class="pi pi-inbox" aria-hidden="true"></i></div>
                  <div class="ea__title">{{ 'ESPACE.AUCUNE' | translate }}</div>
                  <p class="ea__desc">{{ 'ESPACE.AUCUNE_DESC' | translate }}</p>
                </div>
              } @else {
                <ul class="ea__list">
                  @for (f of data()!.factures; track f.facture_id) {
                    <li class="ea__fac">
                      <div class="ea__fac-head">
                        <span class="ea__fac-num">{{ f.numero || ('ESPACE.FACTURE' | translate) }}</span>
                        <span class="ea__badge" [class]="statutClass(f.statut)">{{ statutKey(f.statut) | translate }}</span>
                      </div>

                      <div class="ea__fac-grid">
                        <div class="ea__fac-cell">
                          <span class="ea__fac-k">{{ 'ESPACE.LABEL_RELEVE' | translate }}</span>
                          <span class="ea__fac-v">{{ f.date_releve ? (f.date_releve | date: 'dd/MM/yyyy') : '—' }}</span>
                        </div>
                        <div class="ea__fac-cell">
                          <span class="ea__fac-k">{{ 'ESPACE.LABEL_MONTANT' | translate }}</span>
                          <span class="ea__fac-v">{{ f.montant | fcfa }}</span>
                        </div>
                        @if (f.solde_restant > 0) {
                          <div class="ea__fac-cell">
                            <span class="ea__fac-k">{{ 'ESPACE.LABEL_SOLDE' | translate }}</span>
                            <span class="ea__fac-v ea__fac-v--due">{{ f.solde_restant | fcfa }}</span>
                          </div>
                        }
                        @if (f.montant_paye > 0) {
                          <div class="ea__fac-cell">
                            <span class="ea__fac-k">{{ 'ESPACE.LABEL_PAYE' | translate }}</span>
                            <span class="ea__fac-v">{{ f.montant_paye | fcfa }}</span>
                          </div>
                        }
                        @if (f.date_limite_paiement && f.solde_restant > 0) {
                          <div class="ea__fac-cell">
                            <span class="ea__fac-k">{{ 'ESPACE.LABEL_ECHEANCE' | translate }}</span>
                            <span class="ea__fac-v">{{ f.date_limite_paiement | date: 'dd/MM/yyyy' }}</span>
                          </div>
                        }
                      </div>

                      <button type="button" class="ea__pdf" (click)="ouvrirPdf(f.facture_id)">
                        <i class="pi pi-file-pdf" aria-hidden="true"></i> {{ 'ESPACE.PDF' | translate }}
                      </button>
                    </li>
                  }
                </ul>
              }

              <p class="ea__foot">{{ 'ESPACE.FOOTER' | translate }}</p>
            </div>
          }
        }
      </main>
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100dvh; }
      .ea { min-height: 100dvh; background: #f1f5f9; display: flex; flex-direction: column; }
      .ea__topbar { height: 52px; background: #0f1c3d; padding: 0 20px; display: flex; align-items: center; position: sticky; top: 0; z-index: 5; }
      .ea__brand { display: flex; align-items: center; gap: 9px; }
      .ea__brand-name { font-size: 15px; font-weight: 700; color: #fff; }
      .ea__brand-sub { font-size: 11px; color: rgba(255, 255, 255, 0.45); }
      .ea__body { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 22px 16px 40px; }

      /* États plein-écran (chargement / messages) */
      .ea__state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: #64748b; padding: 60px 0; }
      .ea__spinner { font-size: 30px; color: #1a56db; }
      .ea__state-text { font-size: 14px; margin: 0; }
      .ea__card { width: 440px; max-width: 100%; text-align: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 40px rgba(15, 37, 87, 0.08); padding: 36px 32px; }
      .ea__card--msg { margin: auto; }
      .ea__icon { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 16px; background: #eff6ff; color: #1a56db; display: flex; align-items: center; justify-content: center; font-size: 28px; }
      .ea__icon--danger { background: #fef2f2; color: #dc2626; }
      .ea__icon--warn { background: #fffbeb; color: #d97706; }
      .ea__title { font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
      .ea__desc { font-size: 13px; color: #64748b; line-height: 1.6; margin: 0; }
      .ea__btn { margin-top: 18px; display: inline-flex; align-items: center; gap: 8px; background: #1a56db; color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .ea__btn:hover { background: #1e40af; }

      /* Contenu (factures) */
      .ea__content { width: 560px; max-width: 100%; }
      .ea__summary { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 22px; box-shadow: 0 10px 40px rgba(15, 37, 87, 0.06); margin-bottom: 16px; }
      .ea__heading { font-size: 17px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
      .ea__solde { border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
      .ea__solde--due { background: #fef2f2; }
      .ea__solde--ok { background: #ecfdf5; color: #047857; flex-direction: row; align-items: center; gap: 9px; font-size: 14px; font-weight: 600; }
      .ea__solde--ok .pi { font-size: 18px; }
      .ea__solde-label { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #b91c1c; }
      .ea__solde-val { font-size: 26px; font-weight: 800; color: #b91c1c; line-height: 1.1; }
      .ea__solde-sub { font-size: 12px; color: #7f1d1d; }
      .ea__expire { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; margin: 12px 0 0; }

      .ea__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
      .ea__fac { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 18px; box-shadow: 0 4px 18px rgba(15, 37, 87, 0.05); }
      .ea__fac-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      .ea__fac-num { font-size: 14px; font-weight: 700; color: #0f172a; }
      .ea__badge { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
      .ea__badge--ok { background: #ecfdf5; color: #047857; }
      .ea__badge--warn { background: #fffbeb; color: #b45309; }
      .ea__badge--danger { background: #fef2f2; color: #b91c1c; }
      .ea__fac-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
      .ea__fac-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ea__fac-k { font-size: 11px; color: #94a3b8; }
      .ea__fac-v { font-size: 14px; font-weight: 600; color: #1e293b; }
      .ea__fac-v--due { color: #b91c1c; }
      .ea__pdf { margin-top: 14px; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #fff; color: #1a56db; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .ea__pdf:hover { background: #eff6ff; }
      .ea__foot { text-align: center; font-size: 11px; color: #94a3b8; margin: 20px 0 0; line-height: 1.6; }

      @media (max-width: 420px) {
        .ea__fac-grid { grid-template-columns: 1fr; }
        .ea__solde-val { font-size: 23px; }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceAbonneComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(EspaceAbonneService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly etat = signal<Etat>('loading');
  readonly data = signal<EspaceAbonneData | null>(null);

  /** Solde total encore dû (somme des soldes restants) — pilote le bandeau résumé. */
  readonly soldeTotal = computed(() =>
    (this.data()?.factures ?? []).reduce((s, f) => s + (f.solde_restant ?? 0), 0),
  );
  /** Nombre de factures avec un reste à payer. */
  readonly nbAPayer = computed(() =>
    (this.data()?.factures ?? []).filter((f) => (f.solde_restant ?? 0) > 0).length,
  );

  constructor() {
    this.charger();
  }

  charger(): void {
    if (!this.token) {
      this.etat.set('invalid');
      return;
    }
    this.etat.set('loading');
    this.svc.getFactures(this.token).subscribe({
      next: (d) => {
        this.data.set(d);
        this.etat.set('ready');
      },
      // 401 = token invalide/expiré (message dédié) ; tout le reste = incident serveur (réessayable).
      error: (err: HttpErrorResponse) => this.etat.set(err.status === 401 ? 'invalid' : 'error'),
    });
  }

  /** Ouvre le PDF de la facture (endpoint public, token dans l'URL → navigation directe). */
  ouvrirPdf(factureId: string): void {
    window.open(this.svc.pdfUrl(this.token, factureId), '_blank', 'noopener');
  }

  statutClass(statut: string): string {
    switch (statut) {
      case 'PAYEE':
        return 'ea__badge--ok';
      case 'PARTIELLE':
        return 'ea__badge--warn';
      default:
        return 'ea__badge--danger';
    }
  }

  /** Réutilise les libellés de statut de la facturation (IMPAYEE / PARTIELLE / PAYEE). */
  statutKey(statut: string): string {
    return `FACTURATION.STATUT.${statut}`;
  }
}
