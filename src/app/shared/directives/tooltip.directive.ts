import {
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  Renderer2,
  input,
} from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  readonly appTooltip = input.required<string>();
  readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');

  private panel: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (!this.appTooltip()) return;
    this.showTimer = setTimeout(() => this.show(), 300);
  }

  @HostListener('mouseleave')
  @HostListener('click')
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
