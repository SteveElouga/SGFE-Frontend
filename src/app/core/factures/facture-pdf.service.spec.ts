import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { FacturePdfService } from './facture-pdf.service';

/**
 * Le PDF est servi hors GraphQL (endpoint REST du gateway), donc en dehors du
 * chemin normal du JWT côté navigation directe — voir le commentaire du
 * service. Ce qui compte ici : l'URL exacte interrogée, l'ouverture *synchrone*
 * de l'onglet (avant l'await, sinon le bloqueur de popup s'en mêle), le repli
 * téléchargement si la popup est bloquée, et la fermeture de l'onglet vide en
 * cas d'échec.
 */
describe('FacturePdfService', () => {
  function setup() {
    const getSpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: { get: getSpy } },
        { provide: AuthService, useValue: { refreshToken: vi.fn() } },
      ],
    });
    return { service: TestBed.inject(FacturePdfService), getSpy };
  }

  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:fake-url');
    revokeObjectURL = vi.fn();
    // jsdom n'implémente pas ces méthodes.
    URL.createObjectURL = createObjectURL as never;
    URL.revokeObjectURL = revokeObjectURL as never;
  });

  it('interroge l’URL exacte du PDF, sans préfixe /api', async () => {
    const { service, getSpy } = setup();
    const win = { location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(win);
    getSpy.mockReturnValue(of(new Blob(['pdf'])));

    await service.open('f1');

    expect(getSpy).toHaveBeenCalledWith('/factures/f1/pdf/', { responseType: 'blob' });
  });

  it('ouvre l’onglet vide de façon SYNCHRONE, avant toute résolution réseau', () => {
    const { service, getSpy } = setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window);
    // Requête jamais résolue : si l'ouverture attendait le réseau, elle n'aurait pas eu lieu ici.
    getSpy.mockReturnValue({ subscribe: () => undefined } as never);

    void service.open('f1');

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
  });

  it('redirige l’onglet ouvert vers l’URL du blob reçu', async () => {
    const { service, getSpy } = setup();
    const win = { location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(win);
    getSpy.mockReturnValue(of(new Blob(['pdf'])));

    await service.open('f1');

    expect(win.location.href).toBe('blob:fake-url');
  });

  it('replie sur un téléchargement quand la popup est bloquée (window.open renvoie null)', async () => {
    const { service, getSpy } = setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    getSpy.mockReturnValue(of(new Blob(['pdf'])));
    const clickSpy = vi.fn();
    const faux = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(faux);

    await service.open('f1');

    expect(faux.href).toBe('blob:fake-url');
    expect(faux.download).toBe('facture-f1.pdf');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('le repli téléchargement respecte un nom de fichier explicite', async () => {
    const { service, getSpy } = setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    getSpy.mockReturnValue(of(new Blob(['pdf'])));
    const faux = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(faux);

    await service.open('f1', 'ma-facture.pdf');

    expect(faux.download).toBe('ma-facture.pdf');
  });

  it('révoque l’URL du blob après le délai de sécurité', async () => {
    vi.useFakeTimers();
    const { service, getSpy } = setup();
    vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window);
    getSpy.mockReturnValue(of(new Blob(['pdf'])));

    await service.open('f1');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    vi.useRealTimers();
  });

  it('ferme l’onglet vide et relève l’erreur en cas d’échec réseau', async () => {
    const { service, getSpy } = setup();
    const win = { location: { href: '' }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(win);
    getSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    await expect(service.open('f1')).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('ne tente pas de fermer un onglet qui n’a jamais pu s’ouvrir (popup bloquée + échec réseau)', async () => {
    const { service, getSpy } = setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    getSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    await expect(service.open('f1')).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('un 401 déclenche un rafraîchissement puis rejoue la requête (fetchWithAuthRetry)', async () => {
    const { service, getSpy } = setup();
    vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window);
    const auth = TestBed.inject(AuthService) as unknown as { refreshToken: ReturnType<typeof vi.fn> };
    auth.refreshToken.mockResolvedValue(undefined);
    getSpy
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401 })))
      .mockReturnValueOnce(of(new Blob(['pdf'])));

    await service.open('f1');

    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
