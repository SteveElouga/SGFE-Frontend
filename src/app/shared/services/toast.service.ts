import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'progress';

export interface ToastAction {
  label: string;
  handler: () => void;
  variant?: 'primary' | 'secondary';
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  actions?: ToastAction[];
  /** Progress type only */
  current?: number;
  /** Progress type only */
  total?: number;
}

interface InternalToast extends Toast {
  _timerId?: ReturnType<typeof setTimeout>;
}

const AUTO_DISMISS_TYPES = new Set<ToastType>(['success', 'info', 'warning']);
const DISMISS_DELAY_MS = 5000;
const MAX_TOASTS = 3;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<InternalToast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(options: Omit<Toast, 'id'>): string {
    const id = crypto.randomUUID();
    const toast: InternalToast = { ...options, id };

    this._toasts.update(list => {
      const next: InternalToast[] = [toast, ...list];
      if (next.length > MAX_TOASTS) {
        const removed = next.splice(MAX_TOASTS);
        for (const r of removed) {
          if (r._timerId) clearTimeout(r._timerId);
        }
      }
      return next;
    });

    if (AUTO_DISMISS_TYPES.has(options.type)) {
      const timerId = setTimeout(() => this.dismiss(id), DISMISS_DELAY_MS);
      this._toasts.update(list =>
        list.map(t => (t.id === id ? { ...t, _timerId: timerId } : t)),
      );
    }

    return id;
  }

  dismiss(id: string): void {
    this._toasts.update(list => {
      const toast = list.find(t => t.id === id);
      if (toast?._timerId) clearTimeout(toast._timerId);
      return list.filter(t => t.id !== id);
    });
  }

  updateProgress(id: string, current: number, total: number): void {
    this._toasts.update(list =>
      list.map(t => (t.id === id ? { ...t, current, total } : t)),
    );
    if (current >= total) {
      setTimeout(() => this.dismiss(id), 800);
    }
  }

  success(title: string, message?: string, actions?: ToastAction[]): string {
    return this.show({ type: 'success', title, message, actions });
  }

  error(title: string, message?: string, actions?: ToastAction[]): string {
    return this.show({ type: 'error', title, message, actions });
  }

  warning(title: string, message?: string, actions?: ToastAction[]): string {
    return this.show({ type: 'warning', title, message, actions });
  }

  info(title: string, message?: string, actions?: ToastAction[]): string {
    return this.show({ type: 'info', title, message, actions });
  }

  progress(title: string, current: number, total: number): string {
    return this.show({ type: 'progress', title, current, total });
  }
}
