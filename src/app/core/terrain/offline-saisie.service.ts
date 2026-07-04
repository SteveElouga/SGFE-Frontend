import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CampagnesService } from '../campagnes/campagnes.service';
import { extractGqlError } from '../auth/auth.service';

export type SaisieKind = 'INDEX' | 'NON_RELEVE' | 'ESTIME';
export type SaisieState = 'PENDING' | 'SYNCED' | 'ERROR';

/** Une saisie agent mise en file locale (PWA terrain, réseau instable). */
export interface QueuedSaisie {
  id: string;
  kind: SaisieKind;
  campagneId: string;
  abonneId: string;
  abonneNom: string;
  nouveauIndex: number | null;
  consommation: number | null;
  observation: string;
  ts: number;
  state: SaisieState;
  erreur?: string;
}

export type NewSaisie = Omit<QueuedSaisie, 'id' | 'ts' | 'state' | 'erreur'>;

const STORAGE_KEY = 'aquabill.terrain.queue';

/**
 * File de saisies terrain persistée localement. Chaque saisie (index ou
 * non-relevé/estimé) est mise en file puis synchronisée avec le backend dès
 * que le réseau est disponible (auto-sync au retour en ligne + « Réessayer »).
 */
@Injectable({ providedIn: 'root' })
export class OfflineSaisieService {
  private readonly campagnes = inject(CampagnesService);

  readonly online = signal(navigator.onLine);
  readonly queue = signal<QueuedSaisie[]>(this.restore());
  readonly syncing = signal(false);

  readonly pending = computed(() =>
    this.queue().filter((q) => q.state === 'PENDING' || q.state === 'ERROR'),
  );
  readonly synced = computed(() => this.queue().filter((q) => q.state === 'SYNCED'));
  readonly pendingCount = computed(() => this.pending().length);

  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.sync();
    });
    window.addEventListener('offline', () => this.online.set(false));

    // Persistance automatique de la file à chaque changement.
    effect(() => this.persist(this.queue()));
  }

  /** Renvoie les abonnés déjà saisis (présents dans la file), pour éviter les doublons. */
  submittedAbonneIds(): Set<string> {
    return new Set(this.queue().map((q) => q.abonneId));
  }

  enqueue(item: NewSaisie): void {
    const q: QueuedSaisie = {
      ...item,
      id: crypto.randomUUID(),
      ts: Date.now(),
      state: 'PENDING',
    };
    this.queue.update((list) => [q, ...list]);
    if (this.online()) void this.sync();
  }

  async sync(): Promise<void> {
    if (this.syncing() || !this.online()) return;
    const toSync = this.queue().filter((q) => q.state === 'PENDING' || q.state === 'ERROR');
    if (toSync.length === 0) return;

    this.syncing.set(true);
    try {
      for (const item of toSync) {
        try {
          if (item.kind === 'INDEX') {
            await this.campagnes.saisirIndex({
              campagneId: item.campagneId,
              abonneId: item.abonneId,
              nouveauIndex: item.nouveauIndex ?? 0,
              observation: item.observation,
            });
          } else {
            await this.campagnes.marquerNonReleve({
              campagneId: item.campagneId,
              abonneId: item.abonneId,
              statut: item.kind,
              observation: item.observation,
            });
          }
          this.setState(item.id, 'SYNCED');
        } catch (err: unknown) {
          const { message } = extractGqlError(err);
          this.setState(item.id, 'ERROR', message);
        }
      }
    } finally {
      this.syncing.set(false);
    }
  }

  retry(): void {
    void this.sync();
  }

  /** Vide les saisies déjà synchronisées (ex. au rechargement des relevés serveur). */
  clearSynced(): void {
    this.queue.update((list) => list.filter((q) => q.state !== 'SYNCED'));
  }

  private setState(id: string, state: SaisieState, erreur?: string): void {
    this.queue.update((list) =>
      list.map((q) => (q.id === id ? { ...q, state, erreur } : q)),
    );
  }

  private restore(): QueuedSaisie[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as QueuedSaisie[]) : [];
    } catch {
      return [];
    }
  }

  private persist(queue: QueuedSaisie[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Quota / mode privé : la file reste au moins en mémoire pour la session.
    }
  }
}
