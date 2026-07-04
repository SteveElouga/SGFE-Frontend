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
import { WhatsappQr } from '../../../shared/models/configuration.model';

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

  // Le service tourne mais n'a pas encore de QR (démarrage / dégradation).
  readonly waiting = computed(() => !this.ready() && !this.qr() && !this.error());

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
    this.listen();
  }
}
