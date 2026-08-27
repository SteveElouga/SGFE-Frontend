import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Vitesse (px/ms) au-delà de laquelle un geste bref referme, quelle qu'en soit
 * l'amplitude. Sans elle, un petit coup sec vers le bas ne ferme pas : il faut
 * traîner la feuille jusqu'au seuil, ce qui donne une impression de résistance
 * là où le doigt a clairement dit « va-t'en ».
 */
const VITESSE_FERMETURE = 0.11;

/** Distance (px) au-delà de laquelle on referme même sans élan. */
const DISTANCE_FERMETURE = 96;

/**
 * Amortissement du glissement vers le haut. La feuille est déjà en butée ; on
 * ne bloque pas net pour autant — rien ne s'arrête net dans le monde réel, et
 * un mur invisible se sent immédiatement.
 */
const AMORTI_HAUT = 0.25;

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
      <div
        class="bs-sheet__poignee"
        aria-hidden="true"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
      >
        <div class="bs-sheet__grip"></div>
      </div>
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

  // ── Glisser pour fermer ────────────────────────────────────────────────────
  //
  // La poignée était dessinée mais ne servait à rien. C'est une promesse : sur
  // un téléphone, un trait arrondi en haut d'une feuille annonce qu'on peut la
  // tirer. Le premier geste de quelqu'un qui veut fermer est de la pousser vers
  // le bas — et il ne se passait rien, ce qui se lit comme une panne avant de se
  // lire comme une absence de fonctionnalité.
  //
  // Le geste n'existe qu'en mobile : au-delà de 1024 px, la feuille est un
  // dialog centré, que tirer vers le bas n'aurait aucun sens.

  private depart = 0;
  private departLe = 0;
  private decalage = 0;
  private pointeur: number | null = null;

  private get panneau(): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector('.bs-sheet');
  }

  private get gesteApplicable(): boolean {
    return window.matchMedia('(max-width: 1023px)').matches;
  }

  onPointerDown(ev: PointerEvent): void {
    // Un second doigt en cours de glissement ferait sauter la feuille jusqu'à
    // lui : on ignore tout ce qui arrive après le premier.
    if (this.pointeur !== null || !this.open() || !this.gesteApplicable) return;
    this.pointeur = ev.pointerId;
    this.depart = ev.clientY;
    this.departLe = ev.timeStamp;
    this.decalage = 0;
    // La capture garde le geste même si le doigt sort de la poignée — sinon
    // glisser vite fait perdre le contact au bout de quelques pixels.
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    const el = this.panneau;
    if (el) el.style.transition = 'none';
  }

  onPointerMove(ev: PointerEvent): void {
    if (this.pointeur !== ev.pointerId) return;
    const brut = ev.clientY - this.depart;
    // Vers le haut, la feuille est en butée : on laisse un peu de mou plutôt
    // qu'un blocage sec.
    this.decalage = brut >= 0 ? brut : brut * AMORTI_HAUT;
    const el = this.panneau;
    // On écrit `transform` sur l'élément et non une variable CSS : une variable
    // posée sur un parent ferait recalculer les styles de tous ses enfants à
    // chaque image, et une feuille en contient beaucoup.
    if (el) el.style.transform = `translate(-50%, ${this.decalage}px)`;
  }

  onPointerUp(ev: PointerEvent): void {
    if (this.pointeur !== ev.pointerId) return;
    const el = this.panneau;
    const duree = Math.max(1, ev.timeStamp - this.departLe);
    const vitesse = this.decalage / duree;
    this.pointeur = null;

    if (el) {
      el.style.transition = '';
      el.style.transform = '';
    }

    // Un geste bref et net vaut un geste long : on referme sur l'élan comme sur
    // la distance.
    if (this.decalage > DISTANCE_FERMETURE || vitesse > VITESSE_FERMETURE) {
      this.close.emit();
    }
    this.decalage = 0;
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
