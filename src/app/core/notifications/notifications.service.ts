import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FacturesService } from '../factures/factures.service';
import { AuthService } from '../auth/auth.service';
import { formatFcfa } from '../../shared/pipes/fcfa.pipe';
import { nomAbonneOuReference } from '../../shared/utils/abonne.utils';

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
 * État du centre de notifications (cloche + page).
 *
 * Le schéma GraphQL n'expose aucune query `notification*` : plutôt que d'afficher
 * des données fictives — un badge « 3 » permanent portant sur des factures
 * inexistantes —, les notifications sont **dérivées de l'existant** :
 *
 * | Source                                   | Notification produite        |
 * |------------------------------------------|------------------------------|
 * | `envois` dont le statut vaut ECHEC        | Échec d'envoi WhatsApp       |
 * | `impayes` au solde restant > 0            | Facture impayée              |
 * | `paiements` non annulés, sur 7 jours      | Paiement encaissé            |
 *
 * L'état « lu » n'a pas de backend où vivre : il est conservé dans le
 * `localStorage` du poste. C'est une commodité locale, pas une donnée métier.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly translate = inject(TranslateService);

  private readonly _notifications = signal<AppNotification[]>([]);

  /** Notifications triées de la plus récente à la plus ancienne. */
  readonly notifications = computed(() =>
    [...this._notifications()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly unreadCount = computed(
    () => this._notifications().filter((n) => !n.read).length,
  );

  readonly total = computed(() => this._notifications().length);

  markAllRead(): void {
    const ids = this.lireEtatLu();
    this._notifications().forEach((n) => ids.add(n.id));
    this.ecrireEtatLu(ids);
    this._notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  markRead(id: string): void {
    const ids = this.lireEtatLu();
    ids.add(id);
    this.ecrireEtatLu(ids);
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

  // ── Chargement ──────────────────────────────────────────────────────────────

  /**
   * `FacturesService` n'est résolu qu'au premier chargement, pas à la
   * construction : la cloche est injectée par `page-topbar` sur tous les
   * écrans, et une dépendance directe imposerait Apollo à chaque composant —
   * y compris dans les tests qui ne lisent que le compteur.
   */
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private chargement: Promise<void> | null = null;

  /**
   * Les trois sources — envois, impayés, paiements — sont refusées par la
   * gateway à l'AGENT et au SUPERVISEUR. Les appeler pour eux ne produisait
   * pas une cloche vide mais trois toasts « Accès non autorisé » empilés sur
   * l'écran terrain, à chaque connexion.
   */
  private peutCharger(): boolean {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'COMPTABLE';
  }

  /**
   * Compose les notifications à partir des données réelles. Idempotent : appelé
   * une fois par session depuis la coquille, les appels suivants sont ignorés.
   * Un échec reste silencieux — une cloche vide vaut mieux qu'un écran d'erreur
   * sur chaque page.
   */
  load(): Promise<void> {
    if (!this.peutCharger()) return Promise.resolve();
    this.chargement ??= this.charger().catch(() => undefined);
    return this.chargement;
  }

  /** Force un rechargement (après un renvoi WhatsApp, un paiement…). */
  async refresh(): Promise<void> {
    this.chargement = null;
    await this.load();
  }

  private async charger(): Promise<void> {
    const factures = this.injector.get(FacturesService);
    const [envoisRes, impayesRes, paiementsRes, facturesRes] = await Promise.allSettled([
      factures.getAllEnvois(),
      factures.getImpayes(),
      factures.getAllPaiements(),
      factures.getFactures(),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);

    const facturesList = ok(facturesRes);
    const parFacture = new Map(facturesList.map((f) => [f.factureId, f]));
    const libelle = (factureId?: string): { qui: string; ref: string } => {
      const f = factureId ? parFacture.get(factureId) : undefined;
      return {
        qui: nomAbonneOuReference(f?.abonneNom, f?.abonneNumero),
        ref: f?.numeroFacture ?? '',
      };
    };

    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);
    const out: AppNotification[] = [];

    // 1 — Échecs d'envoi WhatsApp : le message n'est pas parti, quelqu'un doit agir.
    for (const e of ok(envoisRes)) {
      if (e.statut !== 'ECHEC') continue;
      const { qui, ref } = libelle(e.factureId);
      out.push({
        id: 'envoi:' + e.envoiId,
        tone: 'danger',
        category: 'SYSTEME',
        icon: 'pi-whatsapp',
        title: t('NOTIFICATIONS.GEN.ENVOI_ECHEC_TITRE'),
        message: t('NOTIFICATIONS.GEN.ENVOI_ECHEC_MSG', {
          qui,
          facture: ref || '—',
          raison: e.raisonEchec || e.erreur || t('NOTIFICATIONS.GEN.RAISON_INCONNUE'),
        }),
        createdAt: e.dateEnvoi,
        read: false,
        actions: [
          { type: 'RETRY', labelKey: 'NOTIFICATIONS.ACTION.RETRY', variant: 'danger' },
          { type: 'FIX_NUMBER', labelKey: 'NOTIFICATIONS.ACTION.FIX_NUMBER', variant: 'ghost' },
        ],
      });
    }

    // 2 — Factures impayées : la file de recouvrement.
    for (const s of ok(impayesRes)) {
      if (!(s.soldeRestant > 0)) continue;
      const { qui, ref } = libelle(s.factureId);
      // Un impayé n'a pas de date d'apparition : on l'horodate à l'échéance
      // dépassée, la seule date qui a un sens pour un comptable.
      const f = parFacture.get(s.factureId);
      const echeance = f?.dateLimitePaiement
        ? new Date(f.dateLimitePaiement).toISOString()
        : new Date().toISOString();
      out.push({
        id: 'impaye:' + s.factureId,
        tone: 'warning',
        category: 'RELANCES',
        icon: 'pi-exclamation-triangle',
        title: t('NOTIFICATIONS.GEN.IMPAYE_TITRE'),
        message: t('NOTIFICATIONS.GEN.IMPAYE_MSG', {
          qui,
          facture: ref || '—',
          solde: formatFcfa(s.soldeRestant),
        }),
        createdAt: echeance,
        read: false,
      });
    }

    // 3 — Paiements encaissés sur 7 jours : la bonne nouvelle, et la trace.
    const limite = Date.now() - 7 * DAY;
    for (const pa of ok(paiementsRes)) {
      if (pa.annule) continue;
      const quand = new Date(pa.datePaiement).getTime();
      if (!Number.isFinite(quand) || quand < limite) continue;
      const { qui, ref } = libelle(pa.factureId);
      out.push({
        id: 'paiement:' + pa.paiementId,
        tone: 'success',
        category: 'PAIEMENTS',
        icon: 'pi-credit-card',
        title: t('NOTIFICATIONS.GEN.PAIEMENT_TITRE'),
        message: t('NOTIFICATIONS.GEN.PAIEMENT_MSG', {
          montant: formatFcfa(pa.montant),
          qui,
          facture: ref || '—',
        }),
        createdAt: pa.datePaiement,
        read: false,
        actions: [{ type: 'VIEW_RECEIPT', labelKey: 'NOTIFICATIONS.ACTION.VIEW_RECEIPT', variant: 'dark' }],
      });
    }

    const lus = this.lireEtatLu();
    this._notifications.set(out.map((n) => ({ ...n, read: lus.has(n.id) })));
  }

  // ── État « lu » : local au poste, faute de backend ───────────────────────────

  private static readonly CLE_LUS = 'sgfe:notifications:lues';

  private lireEtatLu(): Set<string> {
    try {
      const brut = localStorage.getItem(NotificationsService.CLE_LUS);
      return new Set<string>(brut ? (JSON.parse(brut) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }

  private ecrireEtatLu(ids: Set<string>): void {
    try {
      localStorage.setItem(NotificationsService.CLE_LUS, JSON.stringify([...ids]));
    } catch {
      // Navigation privée, quota plein : l'écran reste utilisable sans mémoire.
    }
  }
}
