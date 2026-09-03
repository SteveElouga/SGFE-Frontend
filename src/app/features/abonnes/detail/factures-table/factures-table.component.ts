import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { formatFcfa } from '../../../../shared/pipes/fcfa.pipe';
import type { FactureLigne } from '../../../../graphql/vues';

/**
 * Table de factures — même gabarit que les onglets Info (« dernières
 * factures »), Factures et Impayés de la fiche abonné en dupliquaient trois
 * copies quasi identiques (une sans la colonne conso). Purement
 * présentationnel : la liste à afficher, triée/filtrée/tranchée, reste
 * décidée par le parent (`facturesRecentes`/`facturesTriees`/`facturesImpayees`).
 */
@Component({
  selector: 'app-factures-table',
  imports: [TranslatePipe],
  templateUrl: './factures-table.component.html',
  styleUrl: './factures-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacturesTableComponent {
  private readonly translate = inject(TranslateService);

  readonly factures = input<readonly FactureLigne[]>([]);
  /** L'onglet Impayés n'a pas de colonne consommation. */
  readonly showConso = input(true);

  readonly pdfClick = output<string>();

  formatFCFA(n: number | null | undefined): string {
    // Une seule unité dans toute l'application : « FCFA », jamais « F ».
    return formatFcfa(n);
  }

  periodeFacture(f: FactureLigne): string {
    if (!f.dateReleve) return '—';
    const lang = this.translate.currentLang() ?? 'fr';
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return new Date(f.dateReleve).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  }

  onPdfClick(factureId: string, ev: Event): void {
    ev.stopPropagation();
    this.pdfClick.emit(factureId);
  }
}
