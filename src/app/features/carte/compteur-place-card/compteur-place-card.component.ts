import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { CompteurPipe } from '../../../shared/pipes/compteur.pipe';
import { NomAbonnePipe } from '../../../shared/pipes/nom-abonne.pipe';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import type { AbonneLigne } from '../../../graphql/vues';
import type { CompteurGeoPoint, ResultatItineraire } from '../carte.model';

/**
 * Fiche du compteur sélectionné (marqueur ou ligne de liste) — ancrée en bas
 * de l'écran (« place card »), pas une bulle popup flottante (mission). Non
 * modale à dessein : contrairement à `app-bottom-sheet` (import CSV), elle ne
 * pose pas de voile sur la carte — l'utilisateur doit pouvoir continuer à la
 * faire glisser pendant qu'elle reste ouverte.
 */
@Component({
  selector: 'app-compteur-place-card',
  imports: [DecimalPipe, RouterLink, TranslatePipe, StatusBadgeComponent, CompteurPipe, NomAbonnePipe, TooltipDirective],
  templateUrl: './compteur-place-card.component.html',
  styleUrl: './compteur-place-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompteurPlaceCardComponent {
  readonly open = input(false);
  readonly abonne = input<AbonneLigne | null>(null);
  /** `null` : compteur non géolocalisé (cas normal aujourd'hui, voir
   *  `CarteService.toGeoPoint`) — désactive le bouton Itinéraire. */
  readonly geo = input<CompteurGeoPoint | null>(null);
  readonly itineraireResultat = input<ResultatItineraire | null>(null);
  readonly itineraireLoading = input(false);

  readonly close = output<void>();
  readonly demanderItineraire = output<void>();

  readonly lienAbonne = computed<[string, string] | null>(() => {
    const a = this.abonne();
    return a ? ['/abonnes', a.id] : null;
  });

  readonly dureeAffichee = computed(() => {
    const r = this.itineraireResultat();
    if (!r) return '';
    const min = Math.round(r.dureeMin);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const reste = min % 60;
    return reste > 0 ? `${h} h ${reste} min` : `${h} h`;
  });
}
