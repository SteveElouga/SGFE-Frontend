import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { EnvoiFacture } from '../../../../graphql/vues';

/**
 * Carte « Journal WhatsApp » de la fiche facture. Purement présentationnel :
 * renvoyer un envoi modifie des données possédées par le parent (`envois`,
 * potentiellement `facture`/`solde` après rechargement), donc seulement
 * signalé via `rejouer` — le parent fait l'appel et le rechargement, comme
 * pour `<app-paiements-panel>`.
 */
@Component({
  selector: 'app-envois-panel',
  imports: [TranslatePipe],
  templateUrl: './envois-panel.component.html',
  styleUrl: './envois-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvoisPanelComponent {
  private readonly translate = inject(TranslateService);

  readonly envois = input<readonly EnvoiFacture[]>([]);
  /** Id de l'envoi en cours de renvoi — désactive son seul bouton. */
  readonly renvoiEnCours = input<string | null>(null);

  readonly rejouer = output<string>();

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

  envoiClass(envoi: EnvoiFacture): string {
    if (envoi.erreur) return 'journal-entry--error';
    const t = envoi.typeEnvoi?.toUpperCase() ?? '';
    if (t.includes('RAPPEL') || t.includes('ETAPE_2')) return 'journal-entry--warn';
    if (t.includes('AVERT') || t.includes('ETAPE_3')) return 'journal-entry--error';
    return '';
  }

  /** Libellé du type d'envoi (ENVOIS.TYPE.*), repli sur la valeur brute. */
  envoiTypeLabel(envoi: EnvoiFacture): string {
    const type = envoi.typeEnvoi ?? 'FACTURE';
    const key = `ENVOIS.TYPE.${type.toUpperCase()}`;
    const label = this.translate.instant(key) as string;
    return label === key ? type : label;
  }

  /** Libellé du statut d'envoi (ENVOIS.STATUT.*), déduit de l'erreur à défaut. */
  envoiStatutLabel(envoi: EnvoiFacture): string {
    const statut = envoi.statut || (envoi.erreur ? 'ECHEC' : 'ENVOYE');
    const key = `ENVOIS.STATUT.${statut.toUpperCase()}`;
    const label = this.translate.instant(key) as string;
    return label === key ? statut : label;
  }

  /**
   * Nettoie un message d'erreur technique pour l'affichage : retire les URLs
   * (traces de la librairie WhatsApp) et tronque — le message complet reste
   * disponible au survol (`title`).
   */
  cleanErreur(erreur: string): string {
    const sansUrl = erreur.replace(/\s*\(?https?:\/\/\S*\)?/g, '').replace(/\s{2,}/g, ' ').trim();
    return sansUrl.length > 120 ? `${sansUrl.slice(0, 119)}…` : sansUrl;
  }
}
