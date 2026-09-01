import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { StatutAbonne } from '../../../../shared/models/abonne.model';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCible } from '../../../../graphql/vues';

/**
 * Bottom-sheet de réactivation d'un abonné suspendu. Auto-contenu : appelle le
 * service et émet `(saved)` avec le nouveau statut ; le parent applique le
 * résultat (mise à jour + toast + fermeture). Visibilité pilotée par `[open]`.
 */
@Component({
  selector: 'app-reactiver-sheet',
  imports: [TranslatePipe, BottomSheetComponent],
  templateUrl: './reactiver-sheet.component.html',
  styleUrl: './reactiver-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactiverSheetComponent {
  readonly open = input(false);
  readonly abonne = input<AbonneCible | null>(null);
  readonly close = output<void>();
  readonly saved = output<StatutAbonne>();

  private readonly abonnesService = inject(AbonnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(false);

  readonly title = computed(() => {
    const a = this.abonne();
    if (!a) return '';
    const lang = this.translate.currentLang() ?? undefined;
    return this.translate.instant('ABONNES.DETAIL.REACTIV_TITLE_NOM', { nom: a.nom, prenom: a.prenom }, lang);
  });

  async confirm(): Promise<void> {
    const a = this.abonne();
    if (!a || this.loading()) return;
    this.loading.set(true);
    try {
      const updated = await this.abonnesService.reactiverAbonne(a.id);
      this.saved.emit(updated.statut);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.loading.set(false);
    }
  }
}
