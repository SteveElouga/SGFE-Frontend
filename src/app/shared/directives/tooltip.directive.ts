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
 * annonce « bouton », sans rien d'autre. Le focus clavier l'ouvre aussi — un
 * utilisateur voyant qui navigue au clavier voyait sinon des icônes muettes,
 * là où la souris obtenait une explication.
 *
 * Le délai d'ouverture existe pour qu'un simple passage de souris ne fasse pas
 * surgir des panneaux partout. Mais il ne vaut que pour le premier : une fois
 * qu'un tooltip est ouvert, l'utilisateur a montré qu'il cherchait des
 * explications, et parcourir une barre d'icônes en payant 300 ms à chaque
 * bouton donne à toute la barre un air d'application lente.
 */
/** Point d'ancrage de l'apparition, opposé au côté où le panneau se pose. */
const ORIGINES: Record<'top' | 'bottom' | 'left' | 'right', string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center',
};

/**
 * Délai avant qu'un tooltip isolé n'apparaisse. Il empêche un simple passage de
 * souris de faire surgir des panneaux sur tout le trajet du curseur.
 */
const DELAI_MS = 300;

/**
 * Fenêtre pendant laquelle on reste « en mode explication » après la fermeture
 * d'un tooltip. Assez longue pour couvrir le trajet d'une icône à sa voisine,
 * assez courte pour qu'un retour cinq secondes plus tard reparte du délai.
 */
const ENCHAINEMENT_MS = 600;

@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onHide()',
    '(focus)': 'onFocus()',
    '(blur)': 'onHide()',
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

  // ── État partagé par toutes les instances ─────────────────────────────────
  // Une seule barre d'outils, un seul curseur : l'information « on vient
  // d'expliquer quelque chose » n'appartient à aucun bouton en particulier.
  private static enchaine = false;
  private static finEnchainement: ReturnType<typeof setTimeout> | null = null;

  private static ouvrir(): void {
    TooltipDirective.enchaine = true;
    if (TooltipDirective.finEnchainement) clearTimeout(TooltipDirective.finEnchainement);
  }

  private static fermer(): void {
    if (TooltipDirective.finEnchainement) clearTimeout(TooltipDirective.finEnchainement);
    TooltipDirective.finEnchainement = setTimeout(() => {
      TooltipDirective.enchaine = false;
      TooltipDirective.finEnchainement = null;
    }, ENCHAINEMENT_MS);
  }

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
    // Enchaînement : le voisin s'ouvre sans délai et sans animation. C'est ce
    // qui fait qu'une barre d'icônes se parcourt au lieu de se subir.
    if (TooltipDirective.enchaine) {
      this.show(true);
      return;
    }
    this.showTimer = setTimeout(() => this.show(false), 300);
  }

  /** Le clavier n'attend pas : l'utilisateur a délibérément atteint l'élément. */
  onFocus(): void {
    if (!this.appTooltip()) return;
    this.show(true);
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

  private show(instantane: boolean): void {
    this.destroy();

    const panel = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(panel, 'aq-tooltip');
    this.renderer.setAttribute(panel, 'role', 'tooltip');
    // Le nom est déjà porté par l'`aria-label` de l'hôte : on évite le doublon.
    this.renderer.setAttribute(panel, 'aria-hidden', 'true');
    if (instantane) this.renderer.setAttribute(panel, 'data-instantane', '');
    // L'origine suit le côté d'apparition : le panneau naît du bouton, pas
    // d'un point abstrait au milieu de lui-même.
    panel.style.transformOrigin = ORIGINES[this.tooltipPosition()];
    panel.textContent = this.appTooltip();
    this.renderer.appendChild(document.body, panel);
    this.panel = panel;

    TooltipDirective.ouvrir();
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
      TooltipDirective.fermer();
    }
  }
}
