import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * Feuille modale partagée : **bottom sheet** qui glisse du bas en mobile
 * (coins hauts arrondis + poignée), **dialog centré** en desktop (≥ 721px).
 * Le contenu est projeté (`<ng-content>`) → garde l'encapsulation du parent.
 *
 * ```html
 * <app-bottom-sheet [open]="visible()" (close)="visible.set(false)">
 *   …contenu…
 * </app-bottom-sheet>
 * ```
 */
@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  template: `
    <div
      class="bs-overlay"
      [class.bs-overlay--open]="open()"
      (click)="close.emit()"
      aria-hidden="true"
    ></div>
    <div
      class="bs-sheet"
      [class.bs-sheet--open]="open()"
      role="dialog"
      aria-modal="true"
      [attr.aria-hidden]="!open()"
    >
      <div class="bs-sheet__grip" aria-hidden="true"></div>
      <div class="bs-sheet__body">
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './bottom-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class BottomSheetComponent {
  readonly open = input(false);
  readonly close = output<void>();

  onEscape(): void {
    if (this.open()) this.close.emit();
  }
}
