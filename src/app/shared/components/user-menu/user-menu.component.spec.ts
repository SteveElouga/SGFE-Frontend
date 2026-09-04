import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { UserMenuComponent } from './user-menu.component';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import type { User } from '../../models/user.model';

describe('UserMenuComponent', () => {
  function utilisateur(p: Partial<User> = {}): User {
    return {
      id: 'u-1',
      username: 'akone',
      email: 'akone@sgfe.cm',
      phoneNumber: '+237612345678',
      role: 'COMPTABLE',
      isActive: true,
      createdAt: '2026-01-01',
      ...p,
    };
  }

  function setup(user: User | null = utilisateur(), isAdmin = false) {
    const logout = vi.fn().mockResolvedValue(undefined);
    const setPreference = vi.fn();
    const authMock = { user: signal(user), isAdmin: signal(isAdmin), logout };
    const themeMock = { preference: signal<'auto' | 'light' | 'dark'>('auto'), setPreference };

    TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AuthService, useValue: authMock },
        { provide: ThemeService, useValue: themeMock },
      ],
    });
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement, logout, setPreference };
  }

  /**
   * `p-popover` rend son contenu (`appendTo="body"` par défaut) dans
   * `document.body`, pas dans l'élément du composant : ouvrir le menu par un
   * vrai clic est donc nécessaire pour atteindre nom/rôle, langue, thème et
   * déconnexion — `onShow()` seul ne fait que positionner `isOpen`.
   */
  function ouvrirMenu(fixture: ReturnType<typeof setup>['fixture']): HTMLElement {
    (fixture.nativeElement.querySelector('.um-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    return document.body;
  }

  // ── Ce qui se calcule ──────────────────────────────────────────────────────

  it('l’initiale est la première lettre du nom, en majuscule', () => {
    const { c } = setup(utilisateur({ username: 'akone' }));
    expect(c.userInitial()).toBe('A');
  });

  it("affiche '?' quand personne n'est connecté", () => {
    const { c } = setup(null);
    expect(c.userInitial()).toBe('?');
  });

  it('choisit une couleur d’avatar déterministe à partir du nom (akone)', () => {
    const { c } = setup(utilisateur({ username: 'akone' }));
    // 5 couleurs dans la palette, indexées par `codePointAt(0) % 5` : 'a' vaut
    // 97, 97 % 5 = 2 → la troisième couleur de `avatarColor()`.
    expect(c.avatarColor()).toBe('#7c3aed');
  });

  it('un autre nom peut produire une autre couleur (bdiallo)', () => {
    // 'b' vaut 98, 98 % 5 = 3 → la quatrième couleur : différente de 'akone'
    // ci-dessus, ce qui montre que la couleur dépend bien du nom.
    const { c } = setup(utilisateur({ username: 'bdiallo' }));
    expect(c.avatarColor()).toBe('#db2777');
  });

  // ── Ce qui s'affiche ───────────────────────────────────────────────────────

  it('affiche le nom et le rôle de l’utilisateur connecté', () => {
    const { racine } = setup(utilisateur({ username: 'akone', role: 'COMPTABLE' }));
    expect(racine.querySelector('.um-trigger__name')?.textContent).toBe('akone');
    expect(racine.querySelector('.um-trigger__role')?.textContent).toBe('COMPTABLE');
  });

  it("n'affiche pas le bloc nom/rôle sans utilisateur", () => {
    const { racine } = setup(null);
    expect(racine.querySelector('.um-trigger__info')).toBeNull();
  });

  it("le lien Utilisateurs n'apparaît pas pour un rôle non-administrateur", () => {
    const { fixture } = setup(utilisateur(), false);
    const corps = ouvrirMenu(fixture);
    expect(corps.querySelector('a[routerLink="/utilisateurs"]')).toBeNull();
  });

  it("le lien Utilisateurs apparaît pour un administrateur", () => {
    const { fixture } = setup(utilisateur(), true);
    const corps = ouvrirMenu(fixture);
    expect(corps.querySelector('a[routerLink="/utilisateurs"]')).toBeTruthy();
  });

  it('marque le bouton de langue actif selon currentLang', () => {
    const { fixture } = setup();
    const translate = TestBed.inject(TranslateService);
    translate.use('fr');
    const corps = ouvrirMenu(fixture);
    const boutons = [...corps.querySelectorAll('.um-lang__btn')];
    expect(boutons[0].classList.contains('um-lang__btn--active')).toBe(true);
    expect(boutons[1].classList.contains('um-lang__btn--active')).toBe(false);
  });

  it('marque le bouton de thème actif selon la préférence', () => {
    const { fixture } = setup();
    const corps = ouvrirMenu(fixture);
    const boutons = [...corps.querySelectorAll('.um-theme__btn')];
    expect(boutons[0].textContent).toContain('USER_MENU.THEME_AUTO');
    expect(boutons[0].classList.contains('um-theme__btn--active')).toBe(true);
  });

  // ── Ce que les actions déclenchent ─────────────────────────────────────────

  it('setLang change la langue via TranslateService', () => {
    const { c } = setup();
    const translate = TestBed.inject(TranslateService);
    const useSpy = vi.spyOn(translate, 'use');
    c.setLang('en');
    expect(useSpy).toHaveBeenCalledWith('en');
  });

  it('setTheme délègue au ThemeService', () => {
    const { c, setPreference } = setup();
    c.setTheme('dark');
    expect(setPreference).toHaveBeenCalledWith('dark');
  });

  it('logout appelle le service puis redirige vers /login', async () => {
    const { c, logout } = setup();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await c.logout();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith('/login');
  });

  it('onShow/onHide pilotent le signal isOpen', () => {
    const { c } = setup();
    expect(c.isOpen()).toBe(false);
    c.onShow();
    expect(c.isOpen()).toBe(true);
    c.onHide();
    expect(c.isOpen()).toBe(false);
  });
});
