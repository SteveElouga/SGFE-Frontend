import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { StatutAbonne } from '../../../../shared/models/abonne.model';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCibleCompteur } from '../../../../graphql/vues';

/**
 * Bottom-sheet de résiliation définitive d'un abonné (écran 31 · MC-05).
 * Auto-contenu : case de confirmation obligatoire, appel du service, puis émet
 * `(saved)` avec le nouveau statut. Le parent applique le résultat (mise à jour
 * + toast + fermeture). Visibilité pilotée par `[open]`.
 */
@Component({
  selector: 'app-resilier-sheet',
  imports: [FormsModule, TranslatePipe, BottomSheetComponent],
  templateUrl: './resilier-sheet.component.html',
  styleUrl: './resilier-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResilierSheetComponent {
  readonly open = input(false);
  readonly abonne = input<AbonneCibleCompteur | null>(null);
  readonly close = output<void>();
  readonly saved = output<StatutAbonne>();

  private readonly abonnesService = inject(AbonnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(false);
  readonly confirme = signal(false);

  readonly title = computed(() => {
    const a = this.abonne();
    if (!a) return this.translate.instant('ABONNES.DETAIL.RESILIATION_TITLE');
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('ABONNES.DETAIL.RESIL_TITLE_NOM', { nom: a.nom, prenom: a.prenom }, lang);
  });

  readonly compteurNumDisplay = computed(() => {
    const c = this.abonne()?.compteur;
    if (!c) return '—';
    return `C-${String(c.numeroCompteur).padStart(4, '0')}`;
  });

  constructor() {
    // Décoche la confirmation à chaque ouverture.
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) this.confirme.set(false);
      wasOpen = isOpen;
    });
  }

  async confirm(): Promise<void> {
    const a = this.abonne();
    if (!a || !this.confirme() || this.loading()) return;
    this.loading.set(true);
    try {
      const updated = await this.abonnesService.resilierAbonne(a.id);
      this.saved.emit(updated.statut);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.loading.set(false);
    }
  }
}
