import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
} from '@angular/core';
import { Toast, ToastService } from '../../services/toast.service';
import { calculerReplacements, memoriserPositions, PositionToast } from './toast-flip';

/**
 * Durée du replacement d'un toast poussé par un autre.
 *
 * Court : ce n'est pas une entrée, c'est un ajustement. Le regard suit un
 * mouvement de cette longueur sans s'y arrêter, alors qu'un déplacement plus
 * lent attirerait l'attention sur des toasts qui ne changent pas de contenu.
 */
const REPLACEMENT_MS = 180;

@Component({
  selector: 'app-toast-container',
  standalone: true,
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  private readonly hote: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly toasts = this.toastService.toasts;

  /** Dernière position verticale connue de chaque toast, par identifiant. */
  private readonly positions = new Map<string, number>();

  constructor() {
    // ── Le replacement des toasts ────────────────────────────────────────────
    //
    // La pile est une colonne flex : un nouveau toast s'insère en tête et pousse
    // les autres vers le bas, un toast qui disparaît laisse remonter ceux qui le
    // suivent. Dans les deux cas, ils **sautaient** — aucune transition ne peut
    // s'appliquer à un déplacement causé par la mise en page.
    //
    // La technique est celle du FLIP : on retient où chaque toast se trouvait,
    // on laisse le navigateur recalculer, puis on replace visuellement chacun à
    // son ancienne position avant de l'en laisser glisser. Le déplacement réel a
    // déjà eu lieu ; ce qu'on anime n'est qu'un `transform`, donc rien ne
    // recalcule la mise en page pendant le mouvement.
    //
    // Les nouveaux toasts sont laissés à leur propre animation d'entrée : leur
    // ancienne position n'existe pas, et leur en inventer une les ferait
    // apparaître en glissant depuis un point arbitraire.
    afterRenderEffect(() => {
      this.toasts(); // dépendance : rejouer à chaque changement de la pile
      this.replacer();
    });
  }

  /**
   * Mesure, calcule, applique.
   *
   * Toutes les lectures sont faites avant la première écriture : intercaler une
   * écriture entre deux lectures forcerait le navigateur à recalculer la mise en
   * page à chaque tour de boucle.
   *
   * Le calcul lui-même vit dans `toast-flip.ts` — c'est la partie qui porte des
   * décisions, et elle se vérifie sans navigateur.
   */
  private replacer(): void {
    const elements = Array.from(
      this.hote.nativeElement.querySelectorAll<HTMLElement>('[data-toast-id]'),
    );

    const parId = new Map<string, HTMLElement>();
    const mesures: PositionToast[] = [];
    for (const el of elements) {
      const id = el.dataset['toastId'] ?? '';
      parId.set(id, el);
      mesures.push({ id, haut: el.getBoundingClientRect().top });
    }

    const replacements = calculerReplacements(this.positions, mesures);
    memoriserPositions(this.positions, mesures);

    if (this.mouvementReduit()) return;

    for (const { id, ecart } of replacements) {
      const el = parId.get(id);
      if (!el) continue;
      // Replacer sans transition, puis relâcher : le glissement part de
      // l'ancienne position vers la nouvelle, où l'élément se trouve déjà.
      el.style.transition = 'none';
      el.style.transform = `translateY(${ecart}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${REPLACEMENT_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`;
        el.style.transform = '';
      });
    }
  }

  /** Respecte le réglage système : un déplacement non demandé peut gêner. */
  private mouvementReduit(): boolean {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  progressPercent(toast: Toast): number {
    if (!toast.total || toast.total === 0) return 0;
    return Math.min(100, Math.round(((toast.current ?? 0) / toast.total) * 100));
  }

  actionHandler(handler: () => void, toastId: string): void {
    handler();
    this.toastService.dismiss(toastId);
  }
}
