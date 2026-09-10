import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WhatsappSurveillanceService } from '../whatsapp-surveillance.service';

/**
 * Variable CSS globale par laquelle ce bandeau publie sa hauteur réellement
 * rendue (0 quand il est masqué) — lue par `.toast-stack`
 * (`toast-container.component.scss`) pour décaler son `top` d'autant.
 *
 * Les deux composants vivent dans des arbres DOM disjoints :
 * `app-toast-container` est un frère du routeur racine dans `app.html`, hors
 * de la hiérarchie du shell où ce bandeau est posé (`shell.component.html`,
 * dans `<main class="shell__content">`). Sans ce pont, le toast flottant
 * ignore la présence du bandeau et se pose par-dessus son bouton d'action —
 * `document.documentElement` est le seul terrain commun aux deux arbres.
 */
const VARIABLE_HAUTEUR = '--wa-banniere-hauteur';

/**
 * Bandeau permanent, visible depuis n'importe quel écran de l'application
 * (posé dans `ShellComponent`, pas seulement sur la page Configuration où
 * vit `WhatsappLinkComponent`) — tant que la liaison WhatsApp reste rompue,
 * un admin ne doit pas avoir à ouvrir Configuration pour s'en rendre compte.
 *
 * Complète, sans le remplacer, le rappel actif de
 * `WhatsappSurveillanceService` (toast répété toutes les 10 minutes) : le
 * toast attire l'œil au moment de la bascule, ce bandeau reste visible en
 * continu pour quiconque revient sur l'écran entre deux rappels.
 */
@Component({
  selector: 'app-whatsapp-banner',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './whatsapp-banner.component.html',
  styleUrl: './whatsapp-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappBannerComponent {
  private readonly surveillance = inject(WhatsappSurveillanceService);
  private readonly document = inject(DOCUMENT);
  private readonly hote: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly rompu = this.surveillance.rompu;
  readonly depuis = this.surveillance.depuis;

  constructor() {
    // ResizeObserver plutôt qu'un `effect()` calé sur `rompu()` : la bannière
    // peut passer sur deux lignes sous 480px de large (voir le `@media` du
    // .scss), donc sa hauteur ne dépend pas que de son affichage/masquage
    // mais aussi de la largeur d'écran — un redimensionnement de fenêtre en
    // cours d'affichage ne changerait pas le signal `rompu()`, mais change
    // bien la hauteur réelle. `contentRect.height` vaut naturellement 0
    // quand `@if (rompu())` n'a rien rendu : un seul mécanisme couvre les
    // deux cas, sans branche séparée pour l'état masqué.
    if (typeof ResizeObserver === 'undefined') return; // même garde de robustesse que ThemeService pour `document`
    const observateur = new ResizeObserver(([entree]) => {
      this.publierHauteur(entree?.contentRect.height ?? 0);
    });
    observateur.observe(this.hote.nativeElement);
    this.destroyRef.onDestroy(() => {
      observateur.disconnect();
      this.publierHauteur(0);
    });
  }

  private publierHauteur(hauteur: number): void {
    this.document.documentElement.style.setProperty(VARIABLE_HAUTEUR, `${hauteur}px`);
  }
}
