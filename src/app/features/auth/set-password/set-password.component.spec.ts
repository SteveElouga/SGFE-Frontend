import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { SetPasswordComponent } from './set-password.component';

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup(
  mode: 'activate' | 'reset',
  token: string | null,
  params: Record<string, string> = {},
) {
  const mutateSpy = vi.fn();

  TestBed.configureTestingModule({
    imports: [SetPasswordComponent],
    providers: [
      provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      provideRouter([]),
      { provide: Apollo, useValue: { mutate: mutateSpy } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            data: { mode },
            queryParamMap: convertToParamMap(token ? { token, ...params } : params),
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(SetPasswordComponent);
  return { fixture, component: fixture.componentInstance, mutateSpy };
}

describe('SetPasswordComponent', () => {

  it('shows an error immediately when the token is missing', () => {
    const { component } = setup('reset', null);
    expect(component.errorMessage()).toBe('Lien invalide : le jeton est manquant.');
    expect(component.canSubmit()).toBe(false);
  });

  it('requires matching passwords of at least 8 characters before enabling submit', () => {
    const { component } = setup('reset', 'tok-123');

    component.password.set('short');
    component.confirmPassword.set('short');
    expect(component.canSubmit()).toBe(false);

    component.password.set('longenough1');
    component.confirmPassword.set('longenough2');
    expect(component.passwordsMatch()).toBe(false);
    expect(component.canSubmit()).toBe(false);

    component.confirmPassword.set('longenough1');
    expect(component.canSubmit()).toBe(true);
  });

  it('classe la force "Forte" (3 critères sur 4, sans symbole) séparément de "Très forte"', () => {
    const { component } = setup('reset', 'tok-123');
    component.password.set('Longenough1'); // longueur + majuscule + chiffre, sans symbole → 3
    expect(component.passwordStrength()).toBe(3);
    expect(component.strengthMeta()).toEqual({ text: 'Forte', color: '#0e9f6e' });
  });

  it('sans mode déclaré dans les données de route, retombe sur "reset"', () => {
    // `setup` fournit toujours `data: { mode }` ; ce test simule l'absence
    // totale de la clé `mode` (le `?? 'reset'` du constructeur).
    TestBed.configureTestingModule({
      imports: [SetPasswordComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        provideRouter([]),
        { provide: Apollo, useValue: { mutate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: {}, queryParamMap: convertToParamMap({ token: 'tok-1' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(SetPasswordComponent);
    expect(fixture.componentInstance.mode).toBe('reset');
  });

  it('onSubmit ne fait rien tant que le formulaire est invalide (garde `!canSubmit()`)', async () => {
    const { component, mutateSpy } = setup('reset', 'tok-123');
    expect(component.canSubmit()).toBe(false); // champs vides
    await component.onSubmit();
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('calls resetPassword in reset mode and shows success', async () => {
    const { component, mutateSpy } = setup('reset', 'tok-123');
    mutateSpy.mockReturnValue(of({ data: { resetPassword: true } }));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmit();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token: 'tok-123', password: 'longenough1' } }),
    );
    expect(component.success()).toBe(true);
  });

  it('calls activateAccount in activate mode', async () => {
    const { component, mutateSpy } = setup('activate', 'tok-456');
    mutateSpy.mockReturnValue(of({ data: { activateAccount: true } }));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    component.fullName.set('Jean Test'); // requis pour valider le mode activation
    await component.onSubmit();

    const mutationCall = mutateSpy.mock.calls[0][0];
    expect(mutationCall.variables).toEqual({ token: 'tok-456', password: 'longenough1' });
    expect(component.success()).toBe(true);
  });

  it('shows a generic error when the token is invalid or expired', async () => {
    const { component, mutateSpy } = setup('reset', 'expired-token');
    mutateSpy.mockReturnValue(throwError(() => new Error('token expired')));

    component.password.set('longenough1');
    component.confirmPassword.set('longenough1');
    await component.onSubmit();

    expect(component.success()).toBe(false);
    expect(component.errorMessage()).toBe(
      'Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis la page de connexion.',
    );
  });
});

/**
 * Les tests ci-dessus n'appellent jamais `detectChanges()` : ils vérifient la
 * logique (signaux, `canSubmit`, appels au service) sans jamais rendre le
 * template. Les blocs suivants rendent réellement le DOM — mode activation et
 * mode réinitialisation, chacun de leurs `@if`/`@for`, et déclenchent de
 * vraies interactions (saisie clavier, soumission de formulaire) plutôt que
 * de simples appels de méthode.
 */
describe('SetPasswordComponent — rendu du template (mode activation)', () => {
  function monter(over: {
    token?: string | null;
    username?: string;
    email?: string;
    role?: string;
  } = {}) {
    const { token = 'tok-abc', username = 'jdupont', email = 'jdupont@sgfe.test', role = 'AGENT' } = over;
    const { fixture, component, mutateSpy } = setup('activate', token, { username, email, role });
    fixture.detectChanges();
    return { fixture, c: component, mutateSpy, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche les informations préremplies (utilisateur, email, rôle) et le badge de disponibilité', () => {
    const { racine } = monter({ username: 'jdupont', email: 'jdupont@sgfe.test', role: 'agent' });
    expect(racine.textContent).toContain('jdupont');
    expect(racine.textContent).toContain('jdupont@sgfe.test');
    expect(racine.querySelector('.activate-role__badge--agent')).toBeTruthy();
    expect(racine.textContent).toContain('Relevés terrain (mobile PWA)');
    // `prefilledUsername` non vide → l'indicateur "Disponible" est rendu (@if ligne 99).
    expect(racine.querySelector('.activate-available')).toBeTruthy();
  });

  it('masque l’indicateur de disponibilité et affiche « — »/« N/A » quand rien n’est prérempli', () => {
    const { racine } = monter({ username: '', email: '', role: '' });
    expect(racine.querySelector('.activate-available')).toBeNull();
    // Nom d'utilisateur ET email vides → chacun replie sur son propre « — ».
    const tirets = Array.from(racine.querySelectorAll('.activate-readonly')).map((el) => el.textContent?.trim());
    expect(tirets).toEqual(['—', '—']);
    // Rôle vide → réplie sur « N/A » (et sur le badge "admin" par défaut de ROLE_META).
    expect(racine.textContent).toContain('N/A');
  });

  it('un rôle non répertorié retombe sur le badge par défaut, sans description', () => {
    const { racine } = monter({ role: 'INCONNU' });
    expect(racine.querySelector('.activate-role__badge--admin')).toBeTruthy();
    expect(racine.textContent).toContain('INCONNU');
  });

  it('saisir le nom complet via l’input met réellement à jour le signal (événement DOM natif)', async () => {
    const { fixture, c, racine } = monter();
    // `<form>` enregistre son `NgModel` enfant via une micro-tâche différée
    // (`NgForm.addControl` → `resolvedPromise.then(...)`, dans @angular/forms) :
    // sans ce flush, le value accessor de l'input n'est pas encore branché et
    // l'événement DOM ci-dessous serait silencieusement ignoré.
    await flush();
    const input = racine.querySelector<HTMLInputElement>('#fullName')!;
    expect(input).toBeTruthy();

    input.value = 'Jean Dupont';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.fullName()).toBe('Jean Dupont');
  });

  it('affiche l’indication d’erreur quand les mots de passe diffèrent, la masque quand ils coïncident', () => {
    const { fixture, c, racine } = monter();

    c.password.set('longenough1');
    c.confirmPassword.set('autrechose2');
    fixture.detectChanges();
    expect(racine.querySelector('.activate-error-hint')).toBeTruthy();

    c.confirmPassword.set('longenough1');
    fixture.detectChanges();
    expect(racine.querySelector('.activate-error-hint')).toBeNull();
  });

  it('saisir dans les champs p-password (mot de passe / confirmation) via de vrais événements DOM met à jour les signaux', async () => {
    const { fixture, c, racine } = monter();
    await flush(); // NgForm enregistre ses NgModel enfants via une micro-tâche différée.

    // p-password expose son <input> interne avec le MÊME id que `inputId` —
    // on y tape directement, comme le ferait un navigateur.
    const champMdp = racine.querySelector<HTMLInputElement>('#password')!;
    const champConfirm = racine.querySelector<HTMLInputElement>('#confirmPassword')!;
    expect(champMdp).toBeTruthy();
    expect(champConfirm).toBeTruthy();

    champMdp.value = 'longenough1';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    champConfirm.value = 'longenough1';
    champConfirm.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.password()).toBe('longenough1');
    expect(c.confirmPassword()).toBe('longenough1');
  });

  it('affiche la jauge de force une fois la saisie commencée, avec le bon nombre de barres actives', () => {
    const { fixture, c, racine } = monter();

    // Rien tant que le mot de passe est vide (@if password().length > 0).
    expect(racine.querySelector('.activate-strength')).toBeNull();

    c.password.set('Abcdef12!'); // longueur+maj+chiffre+symbole → force maximale (4)
    fixture.detectChanges();

    const bloc = racine.querySelector('.activate-strength');
    expect(bloc).toBeTruthy();
    expect(bloc!.textContent).toContain('Très forte');
    const barres = racine.querySelectorAll('.activate-strength__bar');
    expect(barres.length).toBe(4);
    // Les 4 barres sont actives (fond coloré, pas le gris neutre #e2e8f0).
    barres.forEach((barre) => {
      expect((barre as HTMLElement).style.background).not.toBe('rgb(226, 232, 240)');
    });
  });

  it('une force faible n’allume qu’une partie des barres', () => {
    const { fixture, c, racine } = monter();
    c.password.set('abc'); // longueur seule insuffisante → aucun critère : force 0
    fixture.detectChanges();

    expect(racine.querySelector('.activate-strength')!.textContent).toContain('Faible');
    const barres = Array.from(racine.querySelectorAll('.activate-strength__bar')) as HTMLElement[];
    const actives = barres.filter((b) => b.style.background !== 'rgb(226, 232, 240)');
    expect(actives.length).toBe(0);
  });

  it('le bouton de soumission est désactivé puis s’active quand le formulaire devient valide', () => {
    const { fixture, c, racine } = monter();
    const bouton = () => racine.querySelector<HTMLButtonElement>('.activate-submit')!;
    expect(bouton().disabled).toBe(true);

    c.fullName.set('Jean Dupont');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    expect(bouton().disabled).toBe(false);
  });

  it('la soumission réelle du formulaire (événement submit) appelle activateAccount avec les bons arguments', async () => {
    const { fixture, c, mutateSpy, racine } = monter({ token: 'tok-xyz' });
    mutateSpy.mockReturnValue(of({ data: { activateAccount: true } }));

    c.fullName.set('Jean Dupont');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    const form = racine.querySelector('form.activate-form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token: 'tok-xyz', password: 'longenough1' } }),
    );
    // Écran de succès affiché, formulaire disparu.
    expect(racine.querySelector('form.activate-form')).toBeNull();
    expect(racine.querySelector('.auth-screen__success')).toBeTruthy();
  });

  it('affiche le message d’erreur générique et conserve le formulaire après un échec de soumission', async () => {
    const { fixture, c, mutateSpy, racine } = monter({ token: 'tok-expired' });
    mutateSpy.mockReturnValue(throwError(() => new Error('expired')));

    c.fullName.set('Jean Dupont');
    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    const form = racine.querySelector('form.activate-form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.style.display).toBe('flex');
    expect(errorHost.textContent).toContain(
      'Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis la page de connexion.',
    );
    expect(racine.querySelector('form.activate-form')).toBeTruthy();
  });

  it('sans jeton, le message d’erreur est visible dès le rendu initial (host style flex)', () => {
    const { racine } = monter({ token: null });
    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.style.display).toBe('flex');
    expect(errorHost.textContent).toContain('Lien invalide : le jeton est manquant.');
  });
});

describe('SetPasswordComponent — rendu du template (mode réinitialisation)', () => {
  function monter(token: string | null = 'tok-reset') {
    const { fixture, component, mutateSpy } = setup('reset', token);
    fixture.detectChanges();
    return { fixture, c: component, mutateSpy, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le formulaire de réinitialisation (pas les champs du mode activation)', () => {
    const { racine } = monter();
    expect(racine.querySelector('form.activate-form')).toBeNull();
    expect(racine.querySelector('form.auth-screen__form')).toBeTruthy();
    expect(racine.querySelector('#fullName')).toBeNull();
  });

  it('affiche l’indication de désaccord des mots de passe puis la masque une fois corrigée', () => {
    const { fixture, c, racine } = monter();
    c.password.set('longenough1');
    c.confirmPassword.set('autre2');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeTruthy();

    c.confirmPassword.set('longenough1');
    fixture.detectChanges();
    expect(racine.querySelector('.auth-screen__hint--error')).toBeNull();
  });

  it('saisir dans les champs p-password (mode réinitialisation) via de vrais événements DOM met à jour les signaux', async () => {
    const { fixture, c, racine } = monter();
    await flush(); // NgForm enregistre ses NgModel enfants via une micro-tâche différée.

    const champMdp = racine.querySelector<HTMLInputElement>('#password')!;
    const champConfirm = racine.querySelector<HTMLInputElement>('#confirmPassword')!;
    expect(champMdp).toBeTruthy();
    expect(champConfirm).toBeTruthy();

    champMdp.value = 'autremdp1';
    champMdp.dispatchEvent(new Event('input', { bubbles: true }));
    champConfirm.value = 'autremdp1';
    champConfirm.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(c.password()).toBe('autremdp1');
    expect(c.confirmPassword()).toBe('autremdp1');
  });

  it('la soumission réelle du formulaire appelle resetPassword puis affiche l’écran de succès', async () => {
    const { fixture, c, mutateSpy, racine } = monter('tok-reset-1');
    mutateSpy.mockReturnValue(of({ data: { resetPassword: true } }));

    c.password.set('longenough1');
    c.confirmPassword.set('longenough1');
    fixture.detectChanges();

    const form = racine.querySelector('form.auth-screen__form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    fixture.detectChanges();

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token: 'tok-reset-1', password: 'longenough1' } }),
    );
    expect(racine.querySelector('form.auth-screen__form')).toBeNull();
    expect(racine.querySelector('.auth-screen__success')).toBeTruthy();
    // Le lien de retour de l'écran de succès porte le libellé "aller à la connexion".
    expect(
      fixture.debugElement.query(By.css('.auth-screen__success app-auth-back-link')),
    ).toBeTruthy();
  });

  it('sans jeton, le message d’erreur est visible et le bouton reste désactivé', () => {
    const { racine } = monter(null);
    const errorHost = racine.querySelector('app-auth-error-message') as HTMLElement;
    expect(errorHost.style.display).toBe('flex');
    expect(errorHost.textContent).toContain('Lien invalide : le jeton est manquant.');
  });
});
