import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FacturesService } from '../../../../core/factures/factures.service';
import { FcfaPipe } from '../../../../shared/pipes/fcfa.pipe';
import { PaiementFormComponent } from '../../../../shared/components/paiement-form/paiement-form.component';
import type { FactureCibleNommee } from '../../../../graphql/vues';

/**
 * Panneau de saisie d'un paiement, affiché inline sous la liste des factures.
 * Auto-contenu : charge le solde à l'ouverture et délègue le formulaire à
 * `<app-paiement-form>` (shared, batch 7 facturation). Émet `(saved)` après
 * enregistrement ; le parent recharge alors la liste. Piloté par l'entrée
 * `[facture]` (null = panneau fermé).
 */
@Component({
  selector: 'app-paiement-panel',
  imports: [TranslatePipe, FcfaPipe, PaiementFormComponent],
  templateUrl: './paiement-panel.component.html',
  styleUrl: './paiement-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaiementPanelComponent {
  readonly facture = input<FactureCibleNommee | null>(null);
  readonly close = output<void>();
  readonly saved = output<void>();

  private readonly facturesService = inject(FacturesService);

  readonly panelSolde = signal<number | null>(null);
  readonly panelLoading = signal(false);

  constructor() {
    // Recharge le solde à chaque changement de facture (nouvelle ouverture)
    // OU à chaque nouvelle référence pour la même facture (signal explicite
    // du parent : « je viens de recharger la liste, refresh ton solde »).
    // Le shared paiement-form observe `panelSolde` et se réinitialise en cascade.
    let currentId: string | null = null;
    effect(() => {
      const f = this.facture();
      if (!f) { currentId = null; return; }
      if (f.factureId !== currentId) {
        currentId = f.factureId;
        this.loadSolde(f);
      } else {
        // Même factureId, nouvelle référence objet = parent a re-fetché
        // les factures après une mutation (P2 batch 8 : keep panel open).
        this.loadSolde(f);
      }
    });
  }

  private loadSolde(f: FactureCibleNommee): void {
    this.panelSolde.set(null);
    this.panelLoading.set(true);
    void this.facturesService.getSoldeFacture(f.factureId).then((s) => {
      this.panelSolde.set(s.soldeRestant);
      this.panelLoading.set(false);
    });
  }
}
