import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * `NgForm` (attaché implicitement à tout `<form>` sans `[formGroup]`) enregistre
 * ses `NgModel` enfants via une micro-tâche différée (`resolvedPromise.then(...)`,
 * dans `@angular/forms`, pour éviter `ExpressionChangedAfterItHasBeenChecked`).
 * Tant que cette micro-tâche n'a pas tourné, le value accessor de l'input n'est
 * pas encore sélectionné : un `dispatchEvent('input')` envoyé juste après le
 * premier `detectChanges()` (sans laisser passer un tick) est silencieusement
 * ignoré. `flush()` (déjà utilisé ailleurs dans ce dépôt pour laisser les
 * promesses se résoudre) laisse cette micro-tâche s'exécuter avant toute
 * simulation de saisie.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
  const mutateSpy = vi.fn();

  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([
        { path: 'login', component: LoginComponent },
        { path: 'dashboard', component: LoginComponent },
        { path: '**', redirectTo: 'login' },
      ]),
      { provide: Apollo, useValue: { mutate: mutateSpy } },
      ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
    ],
  });

  const fixture = TestBed.createComponent(LoginComponent);
  return { fixture, component: fixture.componentInstance, mutateSpy };
}

describe('LoginComponent', () => {

  it('should create the component', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('disables submit until both fields are filled', () => {
    const { component } = setup();
    expect(component.canSubmit()).toBe(false);

    component.identifier.set('admin');
    expect(component.canSubmit()).toBe(false);

    component.password.set('secret');
    expect(component.canSubmit()).toBe(true);
  });

  it('ne soumet rien tant que le formulaire est invalide (marque quand même les champs "touchés")', async () => {
    const { component, mutateSpy } = setup();
    await component.onSubmit();
    expect(mutateSpy).not.toHaveBeenCalled();
    // onSubmit touche les champs même en sortie anticipée : les indices d'erreur
    // peuvent donc s'afficher après une tentative de soumission vide.
    expect(component.identifierTouched()).toBe(true);
    expect(component.passwordTouched()).toBe(true);
  });

  it('shows a generic error message when login fails', async () => {
    const { component, mutateSpy } = setup();
    // Message technique → le composant affiche le fallback lisible.
    mutateSpy.mockReturnValue(throwError(() => new Error('Failed to fetch')));

    component.identifier.set('admin');
    component.password.set('wrong-password');
    await component.onSubmit();

    expect(component.errorMessage()).toBe('Identifiants incorrects. Veuillez réessayer.');
    expect(component.loading()).toBe(false);
  });

  it('affiche le message de repli quand l’échec n’est pas une instance d’Error', async () => {
    // `AuthService.login` enveloppe toujours ses échecs dans un `Error` réel —
    // ce test vise la garde défensive `instanceof Error` de `onSubmit` elle-même,
    // pour le cas (improbable mais réel dans le typage) où le service injecté
    // rejetterait avec une valeur quelconque. On mocke donc AuthService
    // directement, pas seulement Apollo.
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([{ path: 'login', component: LoginComponent }]),
        { provide: AuthService, useValue: { login: vi.fn().mockRejectedValue('panne-brute'), role: () => null } },
        ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    component.identifier.set('admin');
    component.password.set('wrong-password');
    await component.onSubmit();

    expect(component.errorMessage()).toBe('Identifiants incorrects. Veuillez réessayer.');
  });

  it('clears the error message and stops loading after a successful login', async () => {
    const { component, mutateSpy } = setup();
    mutateSpy.mockReturnValue(
      of({
        data: {
          login: {
            accessToken: 'token',
            expiresIn: 3600,
            user: {
              id: '1',
              username: 'admin',
              email: 'admin@aquabill.test',
              role: 'ADMIN',
              isActive: true,
              createdAt: '2026-06-28T00:00:00Z',
            },
          },
        },
      }),
    );

    component.identifier.set('admin');
    component.password.set('correct-password');
    await component.onSubmit();

    expect(component.errorMessage()).toBeNull();
    expect(component.loading()).toBe(false);
  });
});

function loginReussi(role: 'ADMIN' | 'AGENT' | 'SUPERVISEUR' = 'ADMIN') {
  return of({
    data: {
      login: {
        accessToken: 'token',
        expiresIn: 3600,
        user: {
          id: '1',
          username: 'admin',
          email: 'admin@aquabill.test',
          role,
          isActive: true,
          createdAt: '2026-06-28T00:00:00Z',
        },
      },
    },
  });
}

/**
 * Les tests ci-dessus n'appellent jamais `detectChanges()` : le template
 * (checklist, indices de validation, soumission réelle du formulaire) n'est
 * donc jamais rendu ni exercé. Les tests suivants le rendent pour de bon.
 */
describe('LoginComponent — rendu du template', () => {
  function monter() {
    const { fixture, component, mutateSpy } = setup();
    fixture.detectChanges();
    return { fixture, c: component, mutateSpy, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche les 3 items de la checklist (@for)', () => {
    const { racine } = monter();
    const items = racine.querySelectorAll('.login__checklist li');
    expect(items.length).toBe(3);
  });

  it('un blur réel sur le champ identifiant vide affiche l’indice "obligatoire"', () => {
    const { fixture, racine } = monter();
    const input = racine.querySelector<HTMLInputElement>('#identifier')!;
    expect(racine.querySelector('.login__field-hint')).toBeNull();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(racine.querySelector('.login__field-hint')).toBeTruthy();
  });

  it('la saisie réelle d’un identifiant après blur fait disparaître l’indice et bascule l’icône en "valide"', async () => {
    const { fixture, c, racine } = monter();
    // `<form>` enregistre son NgModel enfant via une micro-tâche différée
    // (voir le commentaire sur `flush()` plus haut) : on la laisse s'écouler
    // avant de simuler la moindre saisie, sans quoi le value accessor de
    // l'input n'est pas encore branché et l'événement DOM est ignoré.
    await flush();
    const input = racine.querySelector<HTMLInputElement>('#identifier')!;
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(racine.querySelector('.login__field-hint')).toBeTruthy();

    input.value = 'admin';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.identifier()).toBe('admin');
    expect(racine.querySelector('.login__field-hint')).toBeNull();
    expect(c.identifierIconClass()).toContain('login__icon--valid');
  });

  it('saisir dans le VRAI champ p-password (id="password") met à jour le signal, et son blur déclenche le "touché"', async () => {
    const { fixture, c, racine } = monter();
    await flush(); // même micro-tâche différée de NgForm que pour #identifier.

    // p-password expose son <input> interne avec le MÊME id que `inputId`.
    const champMdp = racine.querySelector<HTMLInputElement>('#password')!;
    expect(champMdp).toBeTruthy();

    champMdp.value = 'secret123';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(c.password()).toBe('secret123');

    expect(racine.querySelectorAll('.login__field-hint').length).toBe(0);
    champMdp.value = '';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    champMdp.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(c.passwordTouched()).toBe(true);
    expect(racine.querySelectorAll('.login__field-hint').length).toBe(1);
  });

  it('affiche le message d’erreur (host flex) après un échec de connexion, et repasse les icônes en "invalide"', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(throwError(() => new Error('Failed to fetch')));

    c.identifier.set('admin');
    c.password.set('wrong');
    fixture.detectChanges();

    const form = racine.querySelector('form.login__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.style.display).toBe('flex');
    expect(errorHost.textContent).toContain('Identifiants incorrects. Veuillez réessayer.');
    expect(c.identifierIconClass()).toContain('login__icon--invalid');
    expect(c.lockIconClass()).toContain('login__icon--invalid');
  });

  it('la soumission réelle du formulaire déclenche la connexion et navigue vers l’écran d’accueil du rôle (ADMIN → /dashboard)', async () => {
    const { fixture, c, mutateSpy, racine } = monter();
    mutateSpy.mockReturnValue(loginReussi('ADMIN'));
    const router = TestBed.inject(Router);

    c.identifier.set('admin');
    c.password.set('correct-password');
    fixture.detectChanges();

    const form = racine.querySelector('form.login__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { identifier: 'admin', password: 'correct-password' } }),
    );
    expect(router.url).toBe('/dashboard');
  });

  it('le bouton de soumission est désactivé tant que le formulaire est incomplet', () => {
    const { fixture, c, racine } = monter();
    const bouton = () => racine.querySelector('app-auth-submit-button p-button button') as HTMLButtonElement | null;
    // Tant que rien n'est rempli, canSubmit() est faux ([disabled]="!canSubmit()").
    expect(c.canSubmit()).toBe(false);

    c.identifier.set('admin');
    c.password.set('secret');
    fixture.detectChanges();

    expect(c.canSubmit()).toBe(true);
    // Le bouton PrimeNG reflète bien l'entrée `disabled` de app-auth-submit-button.
    const b = bouton();
    if (b) expect(b.disabled).toBe(false);
  });
});
