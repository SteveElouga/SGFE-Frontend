import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';

/**
 * Bloc KPI de la fiche abonné (conso moyenne, factures, solde, ancienneté).
 * Purement présentationnel : les valeurs affichées restent calculées dans
 * `AbonneDetailComponent` (leurs signaux sources — `factures`, `soldeImpaye`,
 * `avoir` — alimentent aussi d'autres onglets, pas seulement ce bloc).
 */
@Component({
  selector: 'app-abonne-kpi-grid',
  imports: [TranslatePipe, TooltipDirective],
  templateUrl: './kpi-grid.component.html',
  styleUrl: './kpi-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiGridComponent {
  readonly consoMoyenne = input<number | null>(null);
  readonly nbFactures = input(0);
  readonly soldeKpiClass = input('');
  readonly soldeFormate = input('');
  readonly soldeSub = input('');
  readonly avoir = input(0);
  readonly avoirFormate = input('');
  readonly abonneDepuis = input('');
  readonly moisDepuis = input('');
  /** Un geste d'encaissement n'a de sens que s'il reste un solde ouvert à imputer. */
  readonly hasSoldesOuverts = input(false);

  readonly openEncaissement = output<void>();
  readonly openArriere = output<void>();
}
