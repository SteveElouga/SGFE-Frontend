import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { EspaceAbonneService } from '../../../core/espace-abonne/espace-abonne.service';

type Etat = 'attente' | 'confirmation' | 'confirmee' | 'echouee' | 'expiree' | 'erreur';

/**
 * Écran atteint via `url_redirection` — la route interne renvoyée par
 * `POST /espace-abonne/<token>/paiement/` (`espace/:token/paiement/:sessionId/confirmer`,
 * PUBLIC, sans authGuard, au même niveau que `espace/:token`).
 *
 * ⚠️ MOCK/SANDBOX de démonstration (décision d'audit §10.2 levée pour ce mode
 * uniquement, pas pour un encaissement réel) : AUCUNE vraie passerelle de
 * paiement n'est branchée derrière cette page. « Confirmer le paiement » ne
 * fait qu'appeler le backend de simulation — l'abonné ne doit jamais croire
 * qu'il vient de payer réellement, d'où la mention en évidence dès l'arrivée.
 */
@Component({
  selector: 'app-espace-abonne-paiement-confirmation',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './espace-abonne-paiement-confirmation.component.html',
  styleUrl: './espace-abonne-paiement-confirmation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceAbonnePaiementConfirmationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(EspaceAbonneService);

  readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';

  readonly etat = signal<Etat>('attente');

  /** Lien de retour vers l'espace abonné, proposé quelle que soit l'issue. */
  readonly retourVers = computed(() => `/espace/${this.token}`);

  /**
   * Simule la confirmation du paiement — appelle le mock backend, qui rend
   * `CONFIRMEE`, `ECHOUEE` ou `EXPIREE`.
   */
  confirmer(): void {
    if (this.etat() === 'confirmation') return; // déjà en cours

    this.etat.set('confirmation');
    this.svc.confirmerPaiementEnLigne(this.token, this.sessionId).subscribe({
      next: (rep) => {
        if (rep.statut === 'CONFIRMEE') this.etat.set('confirmee');
        else if (rep.statut === 'EXPIREE') this.etat.set('expiree');
        else this.etat.set('echouee');
      },
      error: () => this.etat.set('erreur'),
    });
  }
}
