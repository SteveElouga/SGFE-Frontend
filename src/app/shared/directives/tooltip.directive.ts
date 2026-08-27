import {
  Directive,
  ElementRef,
  OnDestroy,
  Renderer2,
  effect,
  inject,
  input,
} from '@angular/core';

/**
 * Tooltip léger rendu en `position: fixed` sur `document.body` — il échappe
 * ainsi à l'`overflow`/`z-index` des conteneurs (tableaux, cartes). Apparaît
 * après un délai de survol, se masque au départ, au clic ou à la destruction.
 *
 * ```html
 * <button [appTooltip]="'ABONNES.TOOLTIP' | translate" tooltipPosition="bottom">…</button>
 * ```
 *
 * Accessibilité : sur un hôte sans texte visible (bouton à icône seule), le
 * texte du tooltip devient son `aria-label`. Sans quoi un lecteur d'écran
 * annonce « bouton », sans rien d'autre.
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onHide()',
    '(click)': 'onHide()',
  },
})
export class TooltipDirective implements OnDestroy {
  /** Texte affiché (déjà traduit). Une valeur vide désactive le tooltip. */
  readonly appTooltip = input.required<string>();
  /** Position du panneau relativement à l'élément hôte. */
  readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');

  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  private panel: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const texte = this.appTooltip();
      const hote = this.el.nativeElement;
      // On ne remplace jamais un nom déjà fourni par le gabarit.
      const dejaNomme =
        !!hote.textContent?.trim() ||
        hote.hasAttribute('aria-label') ||
        hote.hasAttribute('aria-labelledby');
      if (texte && !dejaNomme) {
        this.renderer.setAttribute(hote, 'aria-label', texte);
      }
    });
  }

  onMouseEnter(): void {
    if (!this.appTooltip()) return;
    this.showTimer = setTimeout(() => this.show(), 300);
  }

  onHide(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.destroy();
  }

  ngOnDestroy(): void {
    this.onHide();
  }

  private show(): void {
    this.destroy();

    const panel = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(panel, 'aq-tooltip');
    this.renderer.setAttribute(panel, 'role', 'tooltip');
    // Le nom est déjà porté par l'`aria-label` de l'hôte : on évite le doublon.
    this.renderer.setAttribute(panel, 'aria-hidden', 'true');
    panel.textContent = this.appTooltip();
    this.renderer.appendChild(document.body, panel);
    this.panel = panel;

    this.position(panel);
  }

  private position(panel: HTMLElement): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const gap = 8;

    panel.style.position = 'fixed';
    panel.style.zIndex = '9999';

    requestAnimationFrame(() => {
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;

      const pos = this.tooltipPosition();
      let top: number;
      let left: number;

      if (pos === 'top') {
        top = rect.top - ph - gap;
        left = rect.left + rect.width / 2 - pw / 2;
      } else if (pos === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - pw / 2;
      } else if (pos === 'left') {
        top = rect.top + rect.height / 2 - ph / 2;
        left = rect.left - pw - gap;
      } else {
        top = rect.top + rect.height / 2 - ph / 2;
        left = rect.right + gap;
      }

      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    });
  }

  private destroy(): void {
    if (this.panel) {
      this.renderer.removeChild(document.body, this.panel);
      this.panel = null;
    }
  }
}
