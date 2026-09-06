import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { AbonnesService } from '../../core/abonnes/abonnes.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { WhatsappSurveillanceService } from '../../core/whatsapp/whatsapp-surveillance.service';
import { WhatsappBannerComponent } from '../../core/whatsapp/whatsapp-banner/whatsapp-banner.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { BottomTabsComponent } from '../../shared/components/bottom-tabs/bottom-tabs.component';
import { LayoutService } from '../../shared/services/layout.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SidebarComponent, BottomTabsComponent, WhatsappBannerComponent, TranslatePipe],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class ShellComponent {
  readonly layout = inject(LayoutService);

  private readonly hote: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injecteur = inject(Injector);

  constructor() {
    inject(AbonnesService).startCacheSync();
    // Les notifications sont dérivées des envois/impayés/paiements : on les
    // compose une fois par session, sans bloquer l'affichage.
    void inject(NotificationsService).load();
    // Démarré ici (pas dans WhatsappBannerComponent) pour ne s'abonner
    // qu'une fois par session, quel que soit l'écran affiché — le bandeau
    // peut apparaître/disparaître du DOM sans jamais relancer la surveillance.
    inject(WhatsappSurveillanceService).demarrer();

    let premiere = true;

    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // Referme le tiroir mobile à chaque navigation.
        this.layout.closeMenu();

        // ── Le focus suit la navigation ───────────────────────────────────
        //
        // Dans une application d'une seule page, changer d'écran ne déplace
        // rien : le focus reste où il était, sur un bouton qui n'existe plus.
        // Quelqu'un au lecteur d'écran n'entend donc rien annoncer le nouvel
        // écran, et la tabulation suivante repart d'un endroit qui n'a plus de
        // sens.
        //
        // Le premier affichage est laissé tranquille : personne n'a encore
        // navigué, et voler le focus au chargement empêcherait de commencer
        // par le lien d'évitement.
        if (premiere) {
          premiere = false;
          return;
        }
        afterNextRender(
          () => {
            const contenu = this.hote.nativeElement.querySelector<HTMLElement>('#contenu');
            // `preventScroll` : la navigation gère déjà la position de la page,
            // et un saut supplémentaire se lit comme un défaut d'affichage.
            contenu?.focus({ preventScroll: true });
          },
          { injector: this.injecteur },
        );
      });
  }

  /**
   * Échap referme le tiroir.
   *
   * Le voile qui l'entoure est `aria-hidden` et ne se ferme qu'au clic : sans
   * cette touche, quelqu'un qui navigue au clavier n'avait aucun moyen de
   * sortir du tiroir autrement qu'en le traversant en entier.
   */
  onEscape(): void {
    if (this.layout.menuOpen()) this.layout.closeMenu();
  }
}
