import { Injectable, computed, inject, signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { WHATSAPP_QR_QUERY, WHATSAPP_STATUS_SUB } from '../../graphql/queries/configuration.queries';
import { PhaseWhatsapp, WhatsappQr } from '../../shared/models/configuration.model';
import type { WhatsappQrQuery, WhatsappStatusSubscription } from '../../graphql/generated';

/**
 * Surveille la liaison WhatsApp en continu, tout l'écran, pas seulement sur
 * la page Configuration.
 *
 * Réutilise EXACTEMENT le flux déjà construit et éprouvé pour
 * `WhatsappLinkComponent` (instantané HTTP + souscription temps réel +
 * repli sur polling si le WebSocket est muet) : `whatsappStatus` est déjà
 * réservé ADMIN côté gateway (`require_role(info, "ADMIN")`), donc ce
 * service ne s'active jamais pour un autre rôle plutôt que d'essayer et
 * d'échouer en boucle.
 *
 * Ajoute ce qui manquait : un signal exploitable depuis N'IMPORTE QUEL écran
 * (bandeau permanent dans la coquille de l'application) et un rappel actif —
 * un simple bandeau qu'on ne regarde plus au bout de quelques minutes ne
 * suffit pas à se faire remarquer d'un admin occupé ailleurs dans l'appli.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappSurveillanceService {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  private sub?: Subscription;
  private montre?: ReturnType<typeof setTimeout>;
  private secours?: ReturnType<typeof setInterval>;
  private rappel?: ReturnType<typeof setInterval>;
  private demarre = false;
  /** Le toast d'alerte en cours, s'il y en a un — pour ne jamais en empiler plusieurs. */
  private toastId?: string;

  private static readonly MONTRE_MS = 6_000;
  private static readonly SECOURS_MS = 20_000;
  /** Cadence du rappel actif tant que la liaison reste rompue. */
  private static readonly RAPPEL_MS = 10 * 60_000;

  private readonly ready = signal(true);
  private readonly phase = signal<PhaseWhatsapp | string>('demarrage');
  private readonly depuisMs = signal(0);

  // Volontairement plus large que `WhatsappLinkComponent.rompu` (qui ne
  // couvre que 'rupture', pour son propre affichage QR) : ici, la question
  // n'est pas « pourquoi c'est cassé » mais « est-ce qu'un message peut
  // partir maintenant » — et la réponse est non aussi bien quand le service
  // est injoignable ('rupture') que quand il est disponible mais qu'aucun
  // appareil n'a jamais scanné le QR ('qr', qui peut durer indéfiniment tant
  // que personne ne s'en aperçoit). 'demarrage' reste exclu : transitoire,
  // quelques secondes à chaque démarrage de l'appli, l'y inclure
  // déclencherait le bandeau/rappel à chaque chargement de page.
  readonly rompu = computed(() => {
    if (this.ready()) return false;
    const p = this.phase();
    return p === 'rupture' || p === 'qr';
  });

  readonly depuis = computed(() => {
    const ms = this.depuisMs();
    if (ms <= 0) return '';
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `${minutes} min`;
    const heures = Math.floor(minutes / 60);
    const reste = minutes % 60;
    return reste === 0 ? `${heures} h` : `${heures} h ${reste} min`;
  });

  /**
   * Démarre la surveillance — appelé une fois depuis la coquille de
   * l'application (`ShellComponent`), jamais par le composant Configuration
   * lui-même : deux souscriptions au même flux dans le même onglet
   * doubleraient chaque événement sans rien apporter.
   */
  demarrer(): void {
    if (this.demarre) return;
    if (!this.auth.isAdmin()) return; // whatsappStatus est réservé ADMIN côté gateway.
    this.demarre = true;
    this.instantane();
    this.ecouter();
  }

  private instantane(): void {
    this.apollo
      .query<WhatsappQrQuery>({ query: WHATSAPP_QR_QUERY,
        fetchPolicy: 'network-only',
        context: { silentError: true },
      })
      .subscribe({
        next: ({ data }) => {
          if (data?.whatsappQr) this.appliquer(data.whatsappQr);
        },
        error: () => undefined, // La souscription est le chemin principal, voir ci-dessous.
      });
  }

  private ecouter(): void {
    this.sub = this.apollo
      .subscribe<WhatsappStatusSubscription>({ query: WHATSAPP_STATUS_SUB,
        context: { silentError: true },
      })
      .subscribe({
        next: ({ data }) => {
          const status = data?.whatsappStatus;
          if (!status) return;
          this.arreterSecours();
          this.appliquer(status);
        },
        error: () => this.basculerEnSecours(),
      });

    clearTimeout(this.montre);
    this.montre = setTimeout(() => this.basculerEnSecours(), WhatsappSurveillanceService.MONTRE_MS);
  }

  private appliquer(status: WhatsappQr): void {
    clearTimeout(this.montre);
    const etaitRompu = this.rompu();
    this.ready.set(status.ready ?? false);
    this.phase.set(status.phase ?? (status.ready ? 'connecte' : 'demarrage'));
    this.depuisMs.set(status.depuisMs ?? 0);

    // Signal IMMÉDIAT dès la transition connecté → rompu — le bandeau
    // permanent (voir WhatsappBannerComponent) rend déjà l'état visible en
    // continu ; ce toast attire l'œil au moment précis où ça bascule, pour
    // quelqu'un qui ne regarde pas le bandeau à cet instant précis.
    if (this.rompu() && !etaitRompu) {
      this.avertir();
      this.demarrerRappel();
    } else if (!this.rompu()) {
      this.arreterRappel();
      if (this.toastId) {
        this.toast.dismiss(this.toastId);
        this.toastId = undefined;
      }
    }
  }

  private avertir(): void {
    // Un seul toast d'alerte à la fois — le rappel remplace le précédent
    // plutôt que de les empiler (MAX_TOASTS=3 les ferait sinon disparaître
    // de force après le 3e, silencieusement).
    if (this.toastId) this.toast.dismiss(this.toastId);
    this.toastId = this.toast.show({
      type: 'error', // Ne se referme jamais seul — voir ToastService.AUTO_DISMISS_TYPES.
      title: this.translate.instant('ALERTE_WHATSAPP.TITRE'),
      message: this.translate.instant('ALERTE_WHATSAPP.MESSAGE'),
    });
  }

  /** Rappel actif toutes les 10 minutes tant que la liaison reste rompue. */
  private demarrerRappel(): void {
    if (this.rappel) return;
    this.rappel = setInterval(() => {
      if (this.rompu()) this.avertir();
    }, WhatsappSurveillanceService.RAPPEL_MS);
  }

  private arreterRappel(): void {
    clearInterval(this.rappel);
    this.rappel = undefined;
  }

  private basculerEnSecours(): void {
    if (this.secours) return;
    this.instantane();
    this.secours = setInterval(() => this.instantane(), WhatsappSurveillanceService.SECOURS_MS);
  }

  private arreterSecours(): void {
    clearInterval(this.secours);
    this.secours = undefined;
  }
}
