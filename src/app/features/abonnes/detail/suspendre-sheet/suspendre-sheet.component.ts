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
 * Bottom-sheet de suspension d'un abonné actif. Symétrique de
 * `ReactiverSheetComponent` (v3 batch abonnes) — corrige l'asymétrie destructive
 * v1 où « Suspendre » partait sans confirmation alors que « Résilier » exigeait
 * une checkbox. Ici la suspension coupe l'accès à l'eau mais reste réversible :
 * pas de checkbox, mais un récap + bouton d'action explicite.
 */
@Component({
  selector: 'app-suspendre-sheet',
  imports: [TranslatePipe, BottomSheetComponent],
  templateUrl: './suspendre-sheet.component.html',
  styleUrl: './suspendre-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendreSheetComponent {
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
    return this.translate.instant(
      'ABONNES.DETAIL.SUSPENDRE_TITLE_NOM',
      { nom: a.nom, prenom: a.prenom },
      lang,
    );
  });

  async confirm(): Promise<void> {
    const a = this.abonne();
    if (!a || this.loading()) return;
    this.loading.set(true);
    try {
      const updated = await this.abonnesService.suspendreAbonne(a.id);
      this.saved.emit(updated.statut);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.loading.set(false);
    }
  }
}
