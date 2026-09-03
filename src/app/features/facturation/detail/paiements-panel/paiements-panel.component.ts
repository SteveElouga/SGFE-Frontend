import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PaiementFormComponent } from '../../../../shared/components/paiement-form/paiement-form.component';
import { FcfaPipe } from '../../../../shared/pipes/fcfa.pipe';
import type { FactureDetail, PaiementFacture, SoldeDetail } from '../../../../graphql/vues';

/**
 * Carte « Historique des paiements » de la fiche facture : liste des
 * versements (desktop + mobile), barre de progression, et le panneau de
 * saisie `<app-paiement-form>` lui-même.
 *
 * `showForm` reste piloté par le parent : le bouton « + Paiement » de la
 * barre d'actions mobile (`.mactions`, hors de cette carte) l'ouvre aussi —
 * un seul état partagé évite que les deux déclencheurs se désynchronisent.
 * Les actions qui changent des données possédées par le parent (recharger la
 * facture/solde après annulation ou envoi d'un reçu) restent donc de simples
 * événements remontés, jamais des appels directs au service ici.
 */
@Component({
  selector: 'app-paiements-panel',
  imports: [TranslatePipe, FcfaPipe, PaiementFormComponent],
  templateUrl: './paiements-panel.component.html',
  styleUrl: './paiements-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementsPanelComponent {
  readonly paiements = input<readonly PaiementFacture[]>([]);
  readonly solde = input<SoldeDetail | null>(null);
  readonly pctPaye = input(0);
  readonly soldeRestant = input(0);
  /** Reçu tel quel : la gateway type `statut` en `String`, pas en énumération. */
  readonly factureStatut = input('');
  readonly canAddPaiement = input(false);
  readonly peutAnnulerPaiement = input(false);
  readonly envoiRecuEnCours = input<string | null>(null);
  readonly showForm = input(false);
  /** Toujours fourni : ce panneau n'est rendu par le parent que lorsque la
   *  facture est chargée (voir `@else if (facture(); as f)`). Requis plutôt
   *  que nullable pour rester assignable à `FactureCible` (input requis de
   *  `<app-paiement-form>`). */
  readonly facture = input.required<FactureDetail>();

  readonly toggleForm = output<void>();
  readonly closeForm = output<void>();
  readonly envoyerRecu = output<PaiementFacture>();
  readonly ouvrirAnnulation = output<PaiementFacture>();
  readonly paiementSaved = output<void>();

  /** Dupliqué de `FactureDetailComponent.formatDate` — pure, sans dépendance. */
  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
}
