import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ProfilComponent } from './profil.component';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import type { User } from '../../shared/models/user.model';

/**
 * Écran Profil : données de compte en lecture seule, réinitialisation du mot
 * de passe (le seul chemin self-service, il n'existe pas de `changePassword`)
 * et déconnexion. Ces tests portent sur les deux garde-fous du bouton de
 * réinitialisation — désactivé sans e-mail, désactivé pendant l'envoi — et sur
 * le fait que la déconnexion appelle bien le service, sans supposer où elle
 * redirige ensuite.
 */
function utilisateur(p: Partial<User> = {}): User {
  return {
    id: 'u-1',
    username: 'ngo.awa',
    email: 'awa@example.com',
    phoneNumber: '+237600000000',
    role: 'COMPTABLE',
    isActive: true,
    createdAt: '2026-01-01',
    ...p,
  };
}

function monter(user: User | null, over: { requestPasswordReset?: ReturnType<typeof vi.fn>; logout?: ReturnType<typeof vi.fn> } = {}) {
  const requestPasswordReset = over.requestPasswordReset ?? vi.fn().mockResolvedValue(undefined);
  const logout = over.logout ?? vi.fn().mockResolvedValue(undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map(), queryParams: {} }, paramMap: signal(new Map()) } },
      { provide: AuthService, useValue: { user: signal(user), requestPasswordReset, logout } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ProfilComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, requestPasswordReset, logout };
}

describe('ProfilComponent', () => {
  it('affiche l’initiale du nom d’utilisateur en majuscule', () => {
    const { c } = monter(utilisateur({ username: 'awa' }));
    expect(c.initials()).toBe('A');
  });

  it('affiche « ? » quand aucun utilisateur n’est chargé', () => {
    const { c } = monter(null);
    expect(c.initials()).toBe('?');
  });

  it('hasEmail est vrai seulement si un e-mail est renseigné', () => {
    expect(monter(utilisateur({ email: '' })).c.hasEmail()).toBe(false);
    expect(monter(utilisateur({ email: 'a@b.c' })).c.hasEmail()).toBe(true);
  });

  it('le bouton de réinitialisation est désactivé sans e-mail', () => {
    const { fixture } = monter(utilisateur({ email: '' }));
    const btn = (fixture.nativeElement as HTMLElement).querySelector('.btn--outline') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('appelle le service avec l’e-mail du compte courant', async () => {
    const { c, requestPasswordReset } = monter(utilisateur({ email: 'awa@example.com' }));
    await c.requestPasswordReset();
    expect(requestPasswordReset).toHaveBeenCalledWith('awa@example.com');
  });

  it('ne fait rien sans e-mail, même appelé directement', async () => {
    const { c, requestPasswordReset } = monter(utilisateur({ email: '' }));
    await c.requestPasswordReset();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('bascule resetSent à vrai après un envoi réussi', async () => {
    const { c } = monter(utilisateur());
    expect(c.resetSent()).toBe(false);
    await c.requestPasswordReset();
    expect(c.resetSent()).toBe(true);
    expect(c.resetSending()).toBe(false);
  });

  it('ne bascule pas resetSent en cas d’échec, et remonte resetSending à faux', async () => {
    const { c } = monter(utilisateur(), {
      requestPasswordReset: vi.fn().mockRejectedValue(new Error('Panne réseau')),
    });
    await c.requestPasswordReset();
    expect(c.resetSent()).toBe(false);
    expect(c.resetSending()).toBe(false);
  });

  it('n’envoie pas une seconde demande pendant que la première est en vol', async () => {
    let resolve!: () => void;
    const enVol = new Promise<void>((r) => (resolve = r));
    const requestPasswordReset = vi.fn().mockReturnValue(enVol);
    const { c } = monter(utilisateur(), { requestPasswordReset });

    const p1 = c.requestPasswordReset();
    expect(c.resetSending()).toBe(true);
    const p2 = c.requestPasswordReset(); // doit être un no-op immédiat
    resolve();
    await Promise.all([p1, p2]);

    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('logout() délègue à AuthService', async () => {
    const { c, logout } = monter(utilisateur());
    await c.logout();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
