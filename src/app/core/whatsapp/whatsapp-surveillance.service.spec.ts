import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { Subject, of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { WhatsappSurveillanceService } from './whatsapp-surveillance.service';
import type { WhatsappQr } from '../../shared/models/configuration.model';

/**
 * Surveillance app-wide de la liaison WhatsApp : contrairement à
 * `WhatsappLinkComponent` (un écran, un affichage), ce service ne fait que
 * décider QUAND alerter — ces tests portent sur les trois moments qui
 * comptent : la première rupture (signal immédiat), la persistance de la
 * rupture (rappel toutes les 10 min, jamais empilé), et le retour à la
 * normale (silence).
 */
function statut(p: Partial<WhatsappQr> = {}): WhatsappQr {
  return { ready: false, qr: null, number: null, ...p };
}

function monter(over: { admin?: boolean } = {}) {
  const query = vi.fn().mockReturnValue(of({ data: { whatsappQr: null } }));
  const subscribeStream = new Subject<{ data: { whatsappStatus: WhatsappQr | null } }>();
  const subscribe = vi.fn().mockReturnValue(subscribeStream);
  const toastShow = vi.fn().mockReturnValue('toast-1');
  const toastDismiss = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      provideTranslateService({}),
      { provide: Apollo, useValue: { query, subscribe } },
      { provide: AuthService, useValue: { isAdmin: () => over.admin ?? true } },
      { provide: ToastService, useValue: { show: toastShow, dismiss: toastDismiss } },
    ],
  });
  return {
    service: TestBed.inject(WhatsappSurveillanceService),
    query, subscribe, subscribeStream, toastShow, toastDismiss,
  };
}

describe('WhatsappSurveillanceService — rôle', () => {
  it('ne démarre aucune souscription pour un rôle non-ADMIN (réservé côté gateway)', () => {
    const { service, subscribe } = monter({ admin: false });
    service.demarrer();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('ignore un second appel à demarrer() — une seule souscription par session', () => {
    const { service, subscribe } = monter();
    service.demarrer();
    service.demarrer();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsappSurveillanceService — rompu', () => {
  it('n’est pas rompu tant que la phase est "demarrage" (démarrage normal, pas une panne)', () => {
    const { service, subscribeStream } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'demarrage' }) } });
    expect(service.rompu()).toBe(false);
  });

  it('signale immédiatement (toast) à la transition vers phase="rupture"', () => {
    const { service, subscribeStream, toastShow } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 60_000 }) } });

    expect(service.rompu()).toBe(true);
    expect(toastShow).toHaveBeenCalledTimes(1);
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('ne re-signale pas à chaque événement pendant que la rupture persiste', () => {
    const { service, subscribeStream, toastShow } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 60_000 }) } });
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 120_000 }) } });

    expect(toastShow).toHaveBeenCalledTimes(1);
  });

  it('rappelle toutes les 10 minutes tant que la rupture persiste, en remplaçant le toast précédent', () => {
    vi.useFakeTimers();
    const { service, subscribeStream, toastShow, toastDismiss } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 60_000 }) } });
    toastShow.mockClear();

    vi.advanceTimersByTime(10 * 60_000);
    expect(toastShow).toHaveBeenCalledTimes(1);
    expect(toastDismiss).toHaveBeenCalledWith('toast-1');

    vi.advanceTimersByTime(10 * 60_000);
    expect(toastShow).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('redevient calme (toast fermé, rappel arrêté) au retour à ready', () => {
    vi.useFakeTimers();
    const { service, subscribeStream, toastShow, toastDismiss } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 60_000 }) } });
    toastDismiss.mockClear();

    subscribeStream.next({ data: { whatsappStatus: statut({ ready: true, phase: 'connecte' }) } });
    expect(service.rompu()).toBe(false);
    expect(toastDismiss).toHaveBeenCalledWith('toast-1');

    toastShow.mockClear();
    vi.advanceTimersByTime(20 * 60_000);
    expect(toastShow).not.toHaveBeenCalled(); // le rappel ne repart pas tout seul
    vi.useRealTimers();
  });

  it('depuis() formate la durée écoulée', () => {
    const { service, subscribeStream } = monter();
    service.demarrer();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 95 * 60_000 }) } });
    expect(service.depuis()).toBe('1 h 35 min');
  });
});
