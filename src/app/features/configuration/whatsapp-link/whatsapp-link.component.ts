import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Apollo } from 'apollo-angular';
import { Subscription } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { WHATSAPP_QR_QUERY, WHATSAPP_STATUS_SUB } from '../../../graphql/queries/configuration.queries';
import { PhaseWhatsapp, WhatsappQr } from '../../../shared/models/configuration.model';
import type { WhatsappQrQuery, WhatsappStatusSubscription } from '../../../graphql/generated';

@Component({
  selector: 'app-whatsapp-link',
  imports: [TranslatePipe],
  templateUrl: './whatsapp-link.component.html',
  styleUrl: './whatsapp-link.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappLinkComponent implements OnInit, OnDestroy {
  private readonly apollo = inject(Apollo);
  private readonly translate = inject(TranslateService);

  private sub?: Subscription;
  /** Chien de garde : la souscription a-t-elle donné signe de vie ? */
  private montre?: ReturnType<typeof setTimeout>;
  /** Rafraîchissement de secours quand le temps réel est indisponible. */
  private secours?: ReturnType<typeof setInterval>;

  /**
   * Délai au-delà duquel une souscription muette est déclarée hors service.
   *
   * Le gateway envoie un instantané dès l'ouverture du flux : si rien n'arrive
   * en six secondes, ce n'est pas de la lenteur, c'est que la montée en
   * WebSocket n'a pas eu lieu.
   */
  private static readonly MONTRE_MS = 6_000;

  /**
   * Cadence du secours. Le QR de WhatsApp Web tourne toutes les vingt secondes
   * environ : un QR figé devient inscannable, donc un écran de secours doit le
   * renouveler, pas seulement l'afficher une fois.
   */
  private static readonly SECOURS_MS = 20_000;

  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly qr = signal('');
  /** Numéro du compte lié (renseigné quand ready=true). */
  readonly number = signal('');
  readonly error = signal<string | null>(null);
  readonly phase = signal<PhaseWhatsapp | string>('demarrage');
  /** Millisecondes depuis la dernière connexion réussie (0 si jamais). */
  readonly depuisMs = signal(0);

  /**
   * Le flux temps réel ne répond pas — l'écran fonctionne quand même.
   *
   * Il faut le dire : sans cette mention, un QR rafraîchi toutes les vingt
   * secondes au lieu d'être poussé à l'instant paraît identique, jusqu'au jour
   * où l'admin scanne un QR périmé de dix-neuf secondes et se demande pourquoi
   * rien ne se passe.
   */
  readonly tempsReelRompu = signal(false);

  // Le service tourne mais n'a pas encore de QR (démarrage / dégradation).
  readonly waiting = computed(() => !this.ready() && !this.qr() && !this.error());

  /**
   * La liaison est rompue et ne se rétablira pas d'elle-même.
   *
   * L'écran ne recevait qu'un booléen à faux, qui recouvrait aussi bien un
   * service en train de démarrer qu'un service tombé. Il affichait donc
   * « initialisation en cours, patientez » dans les deux cas — un message qui
   * ne devient jamais faux quand c'est le second, et qui pousse à recharger
   * encore et encore en attendant un QR qui ne viendra pas.
   */
  readonly rompu = computed(() => !this.ready() && this.phase() === 'rupture');

  /** Ancienneté de la rupture, en heures et minutes — « depuis quand » se dit. */
  readonly depuis = computed(() => {
    const ms = this.depuisMs();
    if (ms <= 0) return '';
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `${minutes} min`;
    const heures = Math.floor(minutes / 60);
    const reste = minutes % 60;
    return reste === 0 ? `${heures} h` : `${heures} h ${reste} min`;
  });

  ngOnInit(): void {
    // L'instantané d'abord, en HTTP : il peint l'écran sans dépendre du
    // WebSocket. La souscription vient ensuite corriger en direct.
    this.instantane();
    this.listen();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /**
   * Instantané du statut, en HTTP. Ne dépend d'aucun WebSocket.
   *
   * `network-only` : le statut WhatsApp change sans qu'on le sache, un cache
   * n'a rien à dire ici.
   */
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
        // Silencieux : la souscription est le chemin principal, et c'est elle
        // qui portera l'erreur si les deux échouent. Deux bandeaux pour une
        // seule panne ne renseignent pas mieux.
        error: () => undefined,
      });
  }

  /**
   * Statut poussé en temps réel via WebSocket (transport déjà en place, cf.
   * abonneUpdated) : snapshot initial + push à chaque changement d'état — plus
   * de polling. La souscription reste ouverte tant que l'onglet est actif, donc
   * une perte de session (ready→false) est aussi remontée en direct.
   */
  private listen(): void {
    this.sub = this.apollo
      .subscribe<WhatsappStatusSubscription>({ query: WHATSAPP_STATUS_SUB,
        // Erreur affichée en local (bandeau + Réessayer) — pas de toast global.
        context: { silentError: true },
      })
      .subscribe({
        next: ({ data }) => {
          const status = data?.whatsappStatus;
          if (!status) return;
          // Le flux vit : plus besoin du secours.
          this.arreterSecours();
          this.tempsReelRompu.set(false);
          this.appliquer(status);
        },
        error: (err: unknown) => {
          // Le flux est mort, mais l'instantané HTTP marche peut-être : on
          // bascule sur le secours au lieu d'afficher une erreur sur un écran
          // qui a déjà son QR.
          this.basculerEnSecours();
          if (!this.qr() && !this.ready()) {
            const { message } = extractGqlError(err);
            this.error.set(message || this.translate.instant('CONFIGURATION.WHATSAPP_QR_ERROR'));
            this.loading.set(false);
          }
        },
      });

    // Une souscription qui n'échoue pas mais ne délivre rien est le cas le plus
    // trompeur : aucune erreur, aucun contenu, un spinner sans fin. Le gateway
    // envoie son instantané dès l'ouverture du flux — six secondes de silence
    // signifient donc que la montée en WebSocket n'a pas eu lieu.
    clearTimeout(this.montre);
    this.montre = setTimeout(() => this.basculerEnSecours(), WhatsappLinkComponent.MONTRE_MS);
  }

  /** Recopie un statut dans les signaux de l'écran — une seule fois, pour les deux sources. */
  private appliquer(status: WhatsappQr): void {
    clearTimeout(this.montre);
    this.loading.set(false);
    this.error.set(null);
    this.ready.set(status.ready ?? false);
    this.qr.set(status.qr ?? '');
    this.number.set(status.number ?? '');
    this.phase.set(status.phase ?? (status.ready ? 'connecte' : 'demarrage'));
    this.depuisMs.set(status.depuisMs ?? 0);
  }

  /**
   * Le temps réel est hors service : on le dit, et on rafraîchit nous-mêmes.
   *
   * Sans ce secours, l'écran resterait sur le seul instantané du chargement —
   * donc sur un QR qui expire au bout de vingt secondes et que personne ne
   * pourra plus scanner.
   */
  private basculerEnSecours(): void {
    if (this.secours) return;
    this.tempsReelRompu.set(true);
    this.instantane();
    this.secours = setInterval(() => this.instantane(), WhatsappLinkComponent.SECOURS_MS);
  }

  private arreterSecours(): void {
    clearInterval(this.secours);
    this.secours = undefined;
  }

  private stop(): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
    clearTimeout(this.montre);
    this.arreterSecours();
  }

  retry(): void {
    this.stop();
    this.tempsReelRompu.set(false);
    this.loading.set(true);
    this.error.set(null);
    this.qr.set('');
    this.ready.set(false);
    this.number.set('');
    this.phase.set('demarrage');
    this.depuisMs.set(0);
    this.listen();
  }
}
