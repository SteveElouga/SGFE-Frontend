import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Teinte visuelle d'une notification (icône + accent). */
export type NotifTone = 'danger' | 'success' | 'warning' | 'info';

/** Catégorie utilisée par les filtres du centre de notifications. */
export type NotifCategory = 'PAIEMENTS' | 'RELANCES' | 'SYSTEME';

/** Type d'action rapide proposée sur une notification. */
export type NotifActionType = 'RETRY' | 'FIX_NUMBER' | 'VIEW_RECEIPT';

export interface NotifAction {
  type: NotifActionType;
  /** Clé i18n du libellé. */
  labelKey: string;
  variant: 'danger' | 'dark' | 'ghost';
}

export interface AppNotification {
  id: string;
  tone: NotifTone;
  category: NotifCategory;
  /** Icône PrimeIcons (sans le préfixe `pi `). */
  icon: string;
  /**
   * Titre et message sont des DONNÉES (composées côté backend à terme),
   * pas du chrome i18n — ils restent tels quels quelle que soit la langue.
   */
  title: string;
  message: string;
  /** ISO 8601. */
  createdAt: string;
  read: boolean;
  actions?: NotifAction[];
}

export type NotifGroup = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'OLDER';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * État du centre de notifications (cloche + page). Données de démonstration
 * pour l'instant (aucune API backend) : le modèle est structuré pour être
 * remplacé par une query/subscription GraphQL sans changer les composants.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly translate = inject(TranslateService);

  private readonly _notifications = signal<AppNotification[]>(this.seed());

  /** Notifications triées de la plus récente à la plus ancienne. */
  readonly notifications = computed(() =>
    [...this._notifications()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly unreadCount = computed(
    () => this._notifications().filter((n) => !n.read).length,
  );

  readonly total = computed(() => this._notifications().length);

  markAllRead(): void {
    this._notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  markRead(id: string): void {
    this._notifications.update((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  /** Retourne le groupe temporel (Aujourd'hui / Hier / Cette semaine / Plus ancien). */
  groupOf(iso: string): NotifGroup {
    const now = new Date();
    const d = new Date(iso);
    if (this.sameDay(d, now)) return 'TODAY';
    const yesterday = new Date(now.getTime() - DAY);
    if (this.sameDay(d, yesterday)) return 'YESTERDAY';
    if (now.getTime() - d.getTime() < 7 * DAY) return 'WEEK';
    return 'OLDER';
  }

  /** Libellé temporel relatif localisé (« il y a 8 min », « Hier · 09:15 », « Lun. »). */
  relativeTime(iso: string): string {
    const lang = this.translate.currentLang() ?? undefined;
    const now = new Date();
    const d = new Date(iso);
    const diff = now.getTime() - d.getTime();

    if (this.sameDay(d, now)) {
      if (diff < MINUTE) return this.translate.instant('NOTIFICATIONS.TIME.NOW', {}, lang);
      if (diff < HOUR) {
        return this.translate.instant('NOTIFICATIONS.TIME.MIN', { n: Math.floor(diff / MINUTE) }, lang);
      }
      return this.translate.instant('NOTIFICATIONS.TIME.HOUR', { n: Math.floor(diff / HOUR) }, lang);
    }

    const yesterday = new Date(now.getTime() - DAY);
    if (this.sameDay(d, yesterday)) {
      return this.translate.instant('NOTIFICATIONS.TIME.YESTERDAY', { time: this.hhmm(d) }, lang);
    }

    if (diff < 7 * DAY) {
      const wd = d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' });
      return wd.charAt(0).toUpperCase() + wd.slice(1);
    }

    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });
  }

  private sameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private hhmm(d: Date): string {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private atTime(base: Date, hours: number, minutes: number): string {
    const d = new Date(base);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  private seed(): AppNotification[] {
    const now = Date.now();
    const yesterday = new Date(now - DAY);
    const twoDaysAgo = new Date(now - 2 * DAY);
    const threeDaysAgo = new Date(now - 3 * DAY);

    return [
      {
        id: 'n1',
        tone: 'danger',
        category: 'RELANCES',
        icon: 'pi-whatsapp',
        title: "Échec d'envoi WhatsApp",
        message:
          "Yao Kouadio · numéro injoignable — la facture FACT-2026-06-0018 n'a pas été remise. Renvoi manuel requis.",
        createdAt: new Date(now - 8 * MINUTE).toISOString(),
        read: false,
        actions: [
          { type: 'RETRY', labelKey: 'NOTIFICATIONS.ACTION.RETRY', variant: 'danger' },
          { type: 'FIX_NUMBER', labelKey: 'NOTIFICATIONS.ACTION.FIX_NUMBER', variant: 'ghost' },
        ],
      },
      {
        id: 'n2',
        tone: 'success',
        category: 'PAIEMENTS',
        icon: 'pi-credit-card',
        title: 'Paiement reçu',
        message:
          '10 750 FCFA encaissés · Koné Mariam · FACT-2026-06-0002 passe en PARTIELLE (solde 10 750 FCFA).',
        createdAt: new Date(now - 22 * MINUTE).toISOString(),
        read: false,
        actions: [{ type: 'VIEW_RECEIPT', labelKey: 'NOTIFICATIONS.ACTION.VIEW_RECEIPT', variant: 'dark' }],
      },
      {
        id: 'n3',
        tone: 'warning',
        category: 'SYSTEME',
        icon: 'pi-calculator',
        title: 'Compteur estimé — relevé manquant',
        message:
          "Traoré Seydou · AB-0009 · marqué « non relevé » par l'agent camara.i. Consommation estimée sur la moyenne des 3 derniers mois.",
        createdAt: new Date(now - HOUR).toISOString(),
        read: false,
      },
      {
        id: 'n4',
        tone: 'info',
        category: 'SYSTEME',
        icon: 'pi-calendar',
        title: 'Campagne « Juin 2026 » clôturée',
        message: "42 factures générées automatiquement · PDF prêts à l'envoi WhatsApp.",
        createdAt: new Date(now - 3 * HOUR).toISOString(),
        read: true,
      },
      {
        id: 'n5',
        tone: 'danger',
        category: 'RELANCES',
        icon: 'pi-exclamation-triangle',
        title: 'Nouvel impayé détecté',
        message: 'Diarra Fanta · FACT-2026-05-0031 · +5 jours de retard — relance Étape 2.',
        createdAt: this.atTime(yesterday, 16, 40),
        read: true,
      },
      {
        id: 'n6',
        tone: 'info',
        category: 'RELANCES',
        icon: 'pi-send',
        title: 'Relance envoyée — Étape 3',
        message: "Traoré Seydou · avertissement WhatsApp + notification interne à l'admin.",
        createdAt: this.atTime(yesterday, 9, 15),
        read: true,
      },
      {
        id: 'n7',
        tone: 'success',
        category: 'PAIEMENTS',
        icon: 'pi-wallet',
        title: '12 paiements encaissés',
        message: 'Total de la journée : 148 250 FCFA · 3 factures soldées.',
        createdAt: this.atTime(yesterday, 18, 0),
        read: true,
      },
      {
        id: 'n8',
        tone: 'info',
        category: 'SYSTEME',
        icon: 'pi-user',
        title: 'Nouvel utilisateur créé',
        message: 'Camara Ibrahim · rôle AGENT · créé par thierno.d.',
        createdAt: this.atTime(twoDaysAgo, 11, 20),
        read: true,
      },
      {
        id: 'n9',
        tone: 'warning',
        category: 'SYSTEME',
        icon: 'pi-sync',
        title: 'Synchronisation terrain terminée',
        message: '3 relevés saisis hors-ligne ont été remontés au retour du réseau.',
        createdAt: this.atTime(twoDaysAgo, 8, 5),
        read: true,
      },
      {
        id: 'n10',
        tone: 'info',
        category: 'SYSTEME',
        icon: 'pi-calendar',
        title: 'Campagne « Juillet 2026 » planifiée',
        message: 'Démarre le 05/07 à 07h00 · 48 abonnés actifs concernés.',
        createdAt: this.atTime(threeDaysAgo, 10, 0),
        read: true,
      },
    ];
  }
}
