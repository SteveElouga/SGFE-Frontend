import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Apollo, QueryRef } from 'apollo-angular';
import { Subscription } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { extractGqlError } from '../../../core/auth/auth.service';
import { GET_WHATSAPP_SESSION } from '../../../graphql/queries/configuration.queries';

interface WhatsappSession {
  connected: boolean;
  number: string;
  qr: string;
}

const POLL_INTERVAL_MS = 5000;

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

  private queryRef?: QueryRef<{ whatsappSession: WhatsappSession }>;
  private sub?: Subscription;

  readonly loading = signal(true);
  readonly connected = signal(false);
  readonly number = signal('');
  readonly qr = signal('');
  readonly error = signal<string | null>(null);

  // Le service tourne mais n'a pas encore de QR (démarrage / dégradation).
  readonly waiting = computed(() => !this.connected() && !this.qr() && !this.error());

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private startPolling(): void {
    this.queryRef = this.apollo.watchQuery<{ whatsappSession: WhatsappSession }>({
      query: GET_WHATSAPP_SESSION,
      pollInterval: POLL_INTERVAL_MS,
      // Le QR tourne côté serveur : on veut toujours la valeur fraîche.
      fetchPolicy: 'network-only',
    });

    this.sub = this.queryRef.valueChanges.subscribe({
      next: ({ data, loading }) => {
        const session = data?.whatsappSession;
        if (session) {
          const isConnected = session.connected ?? false;
          this.loading.set(false);
          this.error.set(null);
          this.connected.set(isConnected);
          this.number.set(session.number ?? '');
          this.qr.set(session.qr ?? '');
          // Compte lié → inutile de continuer à interroger.
          if (isConnected) {
            this.queryRef?.stopPolling();
          }
        } else {
          this.loading.set(loading ?? false);
        }
      },
      error: (err: unknown) => {
        const { message } = extractGqlError(err);
        this.error.set(message || this.translate.instant('CONFIGURATION.WHATSAPP_QR_ERROR'));
        this.loading.set(false);
        this.queryRef?.stopPolling();
      },
    });
  }

  private stop(): void {
    this.queryRef?.stopPolling();
    this.sub?.unsubscribe();
    this.sub = undefined;
    this.queryRef = undefined;
  }

  retry(): void {
    this.stop();
    this.loading.set(true);
    this.error.set(null);
    this.qr.set('');
    this.connected.set(false);
    this.number.set('');
    this.startPolling();
  }
}
