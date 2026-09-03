import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { CompteurPipe } from '../../../../shared/pipes/compteur.pipe';
import { ErrorBannerComponent } from '../../../../shared/components/error-banner/error-banner.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import type { Compteur, HistoriqueCompteurEntry } from '../../../../shared/models/abonne.model';

/**
 * Onglet « Compteurs » de la fiche abonné : compteur actuel + timeline des
 * remplacements. Purement présentationnel — le chargement paresseux
 * (`historique`/`historiqueLoading`/`historiqueError` et le déclenchement au
 * premier passage sur l'onglet) reste dans `AbonneDetailComponent`, qui garde
 * cet état pour ne pas le perdre à chaque bascule d'onglet (`@if` détruit et
 * recrée le sous-composant à chaque fois — un état interne y serait remis à
 * zéro et rechargerait l'historique en boucle).
 */
@Component({
  selector: 'app-compteurs-panel',
  imports: [DatePipe, DecimalPipe, TranslatePipe, CompteurPipe, ErrorBannerComponent, SkeletonComponent],
  templateUrl: './compteurs-panel.component.html',
  styleUrl: './compteurs-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompteursPanelComponent {
  readonly compteurActuel = input<Compteur | null>(null);
  readonly historique = input<HistoriqueCompteurEntry[]>([]);
  readonly historiqueLoading = input(false);
  readonly historiqueError = input<string | null>(null);
}
