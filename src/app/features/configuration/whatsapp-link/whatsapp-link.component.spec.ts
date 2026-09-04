import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { Subject, of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { WhatsappLinkComponent } from './whatsapp-link.component';
import type { WhatsappQr } from '../../../shared/models/configuration.model';

/**
 * Liaison WhatsApp (écran ADMIN) : statut poussé en temps réel, secouru par un
 * instantané HTTP quand le WebSocket est silencieux ou tombe. Ces tests portent
 * sur les trois bascules qui distinguent un service qui démarre d'un service
 * tombé — la seule chose qui compte pour un administrateur devant ce QR — et
 * sur le repli automatique en son absence.
 */
function statut(p: Partial<WhatsappQr> = {}): WhatsappQr {
  return { ready: false, qr: null, number: null, ...p };
}

function monter(over: {
  queryResult?: WhatsappQr | null;
  subscribeStream?: Subject<{ data: { whatsappStatus: WhatsappQr | null } }>;
} = {}) {
  const query = vi.fn().mockReturnValue(of({ data: { whatsappQr: over.queryResult ?? null } }));
  const subscribeStream = over.subscribeStream ?? new Subject<{ data: { whatsappStatus: WhatsappQr | null } }>();
  const subscribe = vi.fn().mockReturnValue(subscribeStream);

  TestBed.configureTestingModule({
    imports: [WhatsappLinkComponent],
    providers: [
      provideTranslateService({}),
      { provide: Apollo, useValue: { query, subscribe } },
    ],
  });
  const fixture = TestBed.createComponent(WhatsappLinkComponent);
  return { fixture, c: fixture.componentInstance, query, subscribe, subscribeStream };
}

describe('WhatsappLinkComponent — flux normal', () => {
  it('applique l’instantané HTTP dès le montage', () => {
    const { fixture, c } = monter({ queryResult: statut({ qr: 'data:image/png;base64,ABC' }) });
    fixture.detectChanges();
    expect(c.qr()).toBe('data:image/png;base64,ABC');
    expect(c.loading()).toBe(false);
  });

  it('applique un statut reçu en direct — ready + numéro', () => {
    const { fixture, c, subscribeStream } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ ready: true, number: '+237600000000' }) } });

    expect(c.ready()).toBe(true);
    expect(c.number()).toBe('+237600000000');
    expect(c.waiting()).toBe(false);
  });

  it('waiting est vrai tant qu’il n’y a ni QR ni liaison ni erreur', () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    expect(c.waiting()).toBe(true);
  });
});

describe('WhatsappLinkComponent — chien de garde (silence du WebSocket)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bascule en secours après 6s de silence total', () => {
    const { fixture, c, query } = monter();
    fixture.detectChanges();
    query.mockClear();

    vi.advanceTimersByTime(6_000);

    expect(c.tempsReelRompu()).toBe(true);
    expect(query).toHaveBeenCalled(); // relance un instantané HTTP
  });

  it('le secours se répète toutes les 20s tant que le flux reste muet', () => {
    const { fixture, query } = monter();
    fixture.detectChanges();
    vi.advanceTimersByTime(6_000);
    query.mockClear();

    vi.advanceTimersByTime(20_000);
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('un signe de vie avant 6s annule le chien de garde — pas de bascule en secours', () => {
    const { fixture, c, subscribeStream, query } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ ready: true }) } });
    query.mockClear();

    vi.advanceTimersByTime(10_000);

    expect(c.tempsReelRompu()).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('WhatsappLinkComponent — erreurs', () => {
  it('affiche un message d’erreur si le flux échoue avant tout QR', () => {
    const query = vi.fn().mockReturnValue(of({ data: { whatsappQr: null } }));
    const subscribe = vi.fn().mockReturnValue(throwError(() => new Error('WS cassé')));
    TestBed.configureTestingModule({
      imports: [WhatsappLinkComponent],
      providers: [provideTranslateService({}), { provide: Apollo, useValue: { query, subscribe } }],
    });
    const fixture = TestBed.createComponent(WhatsappLinkComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('bascule en secours sans afficher d’erreur si un QR est déjà affiché', () => {
    const query = vi.fn().mockReturnValue(of({ data: { whatsappQr: statut({ qr: 'abc' }) } }));
    const subscribe = vi.fn().mockReturnValue(throwError(() => new Error('WS cassé')));
    TestBed.configureTestingModule({
      imports: [WhatsappLinkComponent],
      providers: [provideTranslateService({}), { provide: Apollo, useValue: { query, subscribe } }],
    });
    const fixture = TestBed.createComponent(WhatsappLinkComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.componentInstance.tempsReelRompu()).toBe(true);
  });
});

describe('WhatsappLinkComponent — liaison rompue', () => {
  it('`rompu` est vrai uniquement quand la phase vaut « rupture » et la liaison n’est pas active', () => {
    const { fixture, c, subscribeStream } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 90 * 60_000 }) } });

    expect(c.rompu()).toBe(true);
    expect(c.depuis()).toBe('1 h 30 min');
  });

  it('ne se déclare pas rompu si la liaison est ready malgré une ancienne phase de rupture', () => {
    const { fixture, c, subscribeStream } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ ready: true, phase: 'rupture' }) } });
    expect(c.rompu()).toBe(false);
  });

  it('depuis() est vide sans ancienneté connue', () => {
    const { fixture, c, subscribeStream } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 0 }) } });
    expect(c.depuis()).toBe('');
  });

  it('depuis() en minutes sous une heure', () => {
    const { fixture, c, subscribeStream } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ phase: 'rupture', depuisMs: 25 * 60_000 }) } });
    expect(c.depuis()).toBe('25 min');
  });
});

describe('WhatsappLinkComponent — retry()', () => {
  it('réinitialise tous les signaux et relance le flux', () => {
    const { fixture, c, subscribeStream, subscribe } = monter();
    fixture.detectChanges();
    subscribeStream.next({ data: { whatsappStatus: statut({ ready: true, number: '+237600000000' }) } });
    expect(c.ready()).toBe(true);

    subscribe.mockClear();
    c.retry();

    expect(c.ready()).toBe(false);
    expect(c.number()).toBe('');
    expect(c.loading()).toBe(true);
    expect(c.tempsReelRompu()).toBe(false);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
