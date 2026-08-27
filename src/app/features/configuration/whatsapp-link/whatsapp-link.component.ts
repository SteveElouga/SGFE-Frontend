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
import { WHATSAPP_STATUS_SUB } from '../../../graphql/queries/configuration.queries';
import { PhaseWhatsapp, WhatsappQr } from '../../../shared/models/configuration.model';

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

  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly qr = signal('');
  /** Numéro du compte lié (renseigné quand ready=true). */
  readonly number = signal('');
  readonly error = signal<string | null>(null);
  readonly phase = signal<PhaseWhatsapp | string>('demarrage');
  /** Millisecondes depuis la dernière connexion réussie (0 si jamais). */
  readonly depuisMs = signal(0);

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
    this.listen();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /**
   * Statut poussé en temps réel via WebSocket (transport déjà en place, cf.
   * abonneUpdated) : snapshot initial + push à chaque changement d'état — plus
   * de polling. La souscription reste ouverte tant que l'onglet est actif, donc
   * une perte de session (ready→false) est aussi remontée en direct.
   */
  private listen(): void {
    this.sub = this.apollo
      .subscribe<{ whatsappStatus: WhatsappQr }>({
        query: WHATSAPP_STATUS_SUB,
        // Erreur affichée en local (bandeau + Réessayer) — pas de toast global.
        context: { silentError: true },
      })
      .subscribe({
        next: ({ data }) => {
          const status = data?.whatsappStatus;
          if (!status) return;
          this.loading.set(false);
          this.error.set(null);
          this.ready.set(status.ready ?? false);
          this.qr.set(status.qr ?? '');
          this.number.set(status.number ?? '');
          this.phase.set(status.phase ?? (status.ready ? 'connecte' : 'demarrage'));
          this.depuisMs.set(status.depuisMs ?? 0);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('CONFIGURATION.WHATSAPP_QR_ERROR'));
          this.loading.set(false);
        },
      });
  }

  private stop(): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
  }

  retry(): void {
    this.stop();
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
