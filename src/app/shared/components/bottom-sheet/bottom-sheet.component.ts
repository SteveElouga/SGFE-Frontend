import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
      [attr.aria-labelledby]="labelledBy() || null"
      [attr.aria-label]="labelledBy() ? null : (ariaLabel() || null)"
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
    '(document:keydown.tab)': 'onTab($event)',
    '(document:keydown.shift.tab)': 'onShiftTab($event)',
  },
})
export class BottomSheetComponent {
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly open = input(false);
  /** ID d'un élément DOM qui titre le dialog (ex. "m07-title"). Requis pour
   *  que le lecteur d'écran annonce autre chose que « dialog ». */
  readonly labelledBy = input<string>('');
  /** Fallback : libellé littéral quand aucun titre projeté n'existe. Utilisé
   *  uniquement si `labelledBy` est vide (sinon `aria-labelledby` gagne). */
  readonly ariaLabel = input<string>('');
  readonly close = output<void>();

  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Focus trap : à l'ouverture, mémorise l'élément focus courant et déplace
    // le focus dans la sheet ; à la fermeture, restaure le focus. Évite qu'un
    // agent au clavier « sorte » de la sheet par derrière (voir critique
    // terrain 2026-07-28 : Sam persona, sheet M-07 sans focus trap).
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) {
        this.previouslyFocused = document.activeElement as HTMLElement | null;
        // Attend le rendu Angular (l'attribut aria-hidden bascule à false).
        queueMicrotask(() => this.focusFirst());
        this.warnIfUnnamed();
      } else if (!isOpen && wasOpen) {
        this.previouslyFocused?.focus?.();
        this.previouslyFocused = null;
      }
      wasOpen = isOpen;
    });
  }

  /**
   * Garde-fou dev : si la sheet s'ouvre sans nom accessible (ni `labelledBy`
   * ni `ariaLabel`), avertit dans la console. Un dialog sans nom viole
   * WCAG 4.1.2 (Name, Role, Value) — VoiceOver/NVDA annoncent « dialog » nu.
   * Actif uniquement en dev (bruit inutile en prod ; le pre-commit hook
   * `scripts/check-bottom-sheet-a11y.mjs` bloque la régression en amont).
   */
  private warnIfUnnamed(): void {
    if (typeof ngDevMode === 'undefined' || !ngDevMode) return;
    if (this.labelledBy() || this.ariaLabel()) return;
    console.warn(
      '[BottomSheetComponent] Ouverte sans nom accessible. Ajoutez ' +
        '`labelledBy="<id-du-titre>"` ou `ariaLabel="Titre"` sur <app-bottom-sheet>.',
    );
  }

  onEscape(): void {
    if (this.open()) this.close.emit();
  }

  /** Retient Tab à l'intérieur du panneau quand la sheet est ouverte. */
  onTab(ev: Event): void {
    if (!this.open()) return;
    const focusables = this.getFocusables();
    if (focusables.length === 0) return;
    const last = focusables[focusables.length - 1];
    if (document.activeElement === last) {
      ev.preventDefault();
      focusables[0].focus();
    }
  }

  onShiftTab(ev: Event): void {
    if (!this.open()) return;
    const focusables = this.getFocusables();
    if (focusables.length === 0) return;
    const first = focusables[0];
    if (document.activeElement === first) {
      ev.preventDefault();
      focusables[focusables.length - 1].focus();
    }
  }

  private getFocusables(): HTMLElement[] {
    const root = this.hostRef.nativeElement.querySelector('.bs-sheet') as HTMLElement | null;
    if (!root) return [];
    const nodes = root.querySelectorAll(FOCUSABLE_SELECTOR);
    const result: HTMLElement[] = [];
    nodes.forEach((n) => {
      const el = n as HTMLElement;
      if (el.offsetParent !== null || el === document.activeElement) result.push(el);
    });
    return result;
  }

  private focusFirst(): void {
    const focusables = this.getFocusables();
    focusables[0]?.focus?.();
  }
}
