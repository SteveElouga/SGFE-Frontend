import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { UtilisateurFormComponent } from './utilisateur-form.component';
import { UsersService } from '../../../core/users/users.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { User } from '../../../shared/models/user.model';

const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };

/**
 * Formulaire utilisateur, à la fois création et édition (même écran, mode
 * déduit de la présence d'un id de route). Ces tests portent sur les règles
 * de validation distinctes entre les deux modes (un identifiant minimum en
 * création, un champ vide accepté en édition), et sur le payload exact envoyé
 * à chaque mutation.
 */
function user(p: Partial<User> = {}): User {
  return {
    id: 'u-1',
    username: 'ngo.awa',
    email: 'awa@example.com',
    phoneNumber: '+237612345678',
    role: 'AGENT',
    isActive: true,
    createdAt: '2026-01-01',
    ...p,
  };
}

function monter(over: {
  routeId?: string | null;
  users?: User[];
  createUser?: ReturnType<typeof vi.fn>;
  updateUser?: ReturnType<typeof vi.fn>;
} = {}) {
  const createUser = over.createUser ?? vi.fn().mockResolvedValue(user());
  const updateUser = over.updateUser ?? vi.fn().mockResolvedValue(user());
  const getUsers = vi.fn().mockResolvedValue(over.users ?? [user()]);
  const navigateByUrl = vi.fn();

  TestBed.configureTestingModule({
    imports: [UtilisateurFormComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigateByUrl, navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: new Map(over.routeId ? [['id', over.routeId]] : []) } },
      },
      { provide: UsersService, useValue: { getUsers, createUser, updateUser } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Apollo, useValue: apolloStub },
    ],
  });
  const fixture = TestBed.createComponent(UtilisateurFormComponent);
  return { fixture, c: fixture.componentInstance, createUser, updateUser, navigateByUrl };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('UtilisateurFormComponent — mode', () => {
  it('démarre en mode création sans id de route', () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    expect(c.mode()).toBe('create');
  });

  it('passe en mode édition et précharge les champs avec un id de route', async () => {
    const { fixture, c } = monter({ routeId: 'u-1', users: [user({ phoneNumber: '+237699887766' })] });
    fixture.detectChanges();
    await flush();
    expect(c.mode()).toBe('edit');
    expect(c.phone()).toBe('699887766');
  });

  it('redirige si l’utilisateur à éditer est introuvable', async () => {
    const { fixture, navigateByUrl } = monter({ routeId: 'inconnu', users: [] });
    fixture.detectChanges();
    await flush();
    expect(navigateByUrl).toHaveBeenCalledWith('/utilisateurs');
  });
});

describe('UtilisateurFormComponent — validation en création', () => {
  it('exige un identifiant d’au moins 3 caractères', () => {
    const { c } = monter();
    c.username.set('ab');
    c.phone.set('612345678');
    expect(c.isFormValid()).toBe(false);
    c.username.set('abc');
    expect(c.isFormValid()).toBe(true);
  });

  it('exige un numéro camerounais valide', () => {
    const { c } = monter();
    c.username.set('abc');
    c.phone.set('123');
    expect(c.isFormValid()).toBe(false);
  });

  it('exige un e-mail seulement pour un ADMIN', () => {
    const { c } = monter();
    c.username.set('abc');
    c.phone.set('612345678');
    c.role.set('ADMIN');
    expect(c.isFormValid()).toBe(false);
    c.email.set('admin@x.com');
    expect(c.isFormValid()).toBe(true);
  });
});

describe('UtilisateurFormComponent — validation en édition', () => {
  it('accepte un téléphone vide (non modifié)', async () => {
    const { fixture, c } = monter({ routeId: 'u-1' });
    fixture.detectChanges();
    await flush();
    c.phone.set('');
    expect(c.isFormValid()).toBe(true);
  });

  it('refuse un téléphone renseigné mais invalide', async () => {
    const { fixture, c } = monter({ routeId: 'u-1' });
    fixture.detectChanges();
    await flush();
    c.phone.set('12');
    expect(c.isFormValid()).toBe(false);
  });
});

describe('UtilisateurFormComponent — soumission', () => {
  it('crée un utilisateur avec le payload exact', async () => {
    const { c, createUser } = monter();
    c.username.set('  jean.k  ');
    c.phone.set('612345678');
    c.role.set('AGENT');
    await c.onSubmit();
    expect(createUser).toHaveBeenCalledWith({
      username: 'jean.k',
      phoneNumber: '+237612345678',
      role: 'AGENT',
      email: undefined,
    });
  });

  it('inclut l’e-mail à la création d’un ADMIN', async () => {
    const { c, createUser } = monter();
    c.username.set('admin1');
    c.phone.set('612345678');
    c.role.set('ADMIN');
    c.email.set('admin1@x.com');
    await c.onSubmit();
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin1@x.com' }),
    );
  });

  it('ne soumet rien si le formulaire est invalide', async () => {
    const { c, createUser } = monter();
    await c.onSubmit();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('modifie un utilisateur existant avec le payload exact', async () => {
    const { fixture, c, updateUser } = monter({ routeId: 'u-1' });
    fixture.detectChanges();
    await flush();
    c.phone.set('698765432');
    await c.onSubmit();
    expect(updateUser).toHaveBeenCalledWith('u-1', {
      phoneNumber: '+237698765432',
      role: 'AGENT',
      email: 'awa@example.com',
    });
  });

  it('affiche un message dédié sur un doublon', async () => {
    const { c } = monter({
      createUser: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'x', extensions: { code: 'ALREADY_EXISTS' } }]),
      ),
    });
    c.username.set('jean');
    c.phone.set('612345678');
    await c.onSubmit();
    expect(c.errorMessage()).toContain('déjà utilisé');
  });

  it('affiche un message dédié sur un refus de droits', async () => {
    const { c } = monter({
      createUser: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'x', extensions: { code: 'PERMISSION_DENIED' } }]),
      ),
    });
    c.username.set('jean');
    c.phone.set('612345678');
    await c.onSubmit();
    expect(c.errorMessage()).toContain('droits');
  });
});

/**
 * Rendu réel du formulaire : les tests ci-dessus ne rendaient jamais le
 * template après `detectChanges()` (saisie/validité pilotées uniquement au
 * niveau des signaux). Ceux-ci saisissent dans les vrais champs, soumettent le
 * vrai `<form>`, et vérifient les indices d'erreur / le champ e-mail
 * conditionnel tels qu'ils apparaissent réellement à l'écran.
 */
describe('UtilisateurFormComponent — rendu réel (création)', () => {
  it('affiche l’indice d’erreur d’identifiant seulement entre 1 et 2 caractères', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champUsername = racine.querySelector<HTMLInputElement>('#username')!;

    expect(racine.querySelector('.user-form__hint--error')).toBeNull();

    champUsername.value = 'ab';
    champUsername.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(racine.querySelector('.user-form__hint--error')?.textContent).toContain('USERNAME_ERROR');

    champUsername.value = 'abc';
    champUsername.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(racine.querySelector('.user-form__hint--error')).toBeNull();
  });

  it('affiche l’indice de téléphone invalide et la classe associée, dans le vrai DOM', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champPhone = racine.querySelector<HTMLInputElement>('#phoneNumber')!;

    champPhone.value = '12';
    champPhone.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(racine.querySelector('.user-form__phone-field--invalid')).toBeTruthy();
    const indices = racine.querySelectorAll('.user-form__hint--error');
    expect(Array.from(indices).some((el) => el.textContent?.includes('PHONE_ERROR'))).toBe(true);

    champPhone.value = '612345678';
    champPhone.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(racine.querySelector('.user-form__phone-field--valid')).toBeTruthy();
    expect(racine.querySelector('.user-form__phone-field--invalid')).toBeNull();
  });

  it('fait apparaître le champ e-mail dès que le rôle ADMIN est choisi', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('#email')).toBeNull();

    c.role.set('ADMIN');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const champEmail = racine.querySelector<HTMLInputElement>('#email')!;
    expect(champEmail).toBeTruthy();
    champEmail.value = 'admin@x.com';
    champEmail.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.email()).toBe('admin@x.com');
  });

  it('soumet le vrai formulaire (submit du DOM) et affiche l’erreur serveur telle quelle', async () => {
    const { fixture, createUser } = monter({
      createUser: vi.fn().mockRejectedValue(new Error('Erreur inattendue du serveur')),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champUsername = racine.querySelector<HTMLInputElement>('#username')!;
    champUsername.value = 'jean.k';
    champUsername.dispatchEvent(new Event('input'));
    const champPhone = racine.querySelector<HTMLInputElement>('#phoneNumber')!;
    champPhone.value = '612345678';
    champPhone.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonSubmit = racine.querySelector<HTMLButtonElement>('.user-form__submit')!;
    expect(boutonSubmit.disabled).toBe(false);

    racine.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flush();
    fixture.detectChanges();

    expect(createUser).toHaveBeenCalled();
    const erreur = racine.querySelector('.user-form__error');
    expect(erreur?.textContent).toContain('Erreur inattendue du serveur');
  });

  it('affiche le spinner pendant la soumission puis l’icône de validation une fois terminé', async () => {
    let resolve!: (u: User) => void;
    const enVol = new Promise<User>((r) => (resolve = r));
    const { fixture } = monter({ createUser: vi.fn().mockReturnValue(enVol) });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champUsername = racine.querySelector<HTMLInputElement>('#username')!;
    champUsername.value = 'jean.k';
    champUsername.dispatchEvent(new Event('input'));
    const champPhone = racine.querySelector<HTMLInputElement>('#phoneNumber')!;
    champPhone.value = '612345678';
    champPhone.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    racine.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const boutonSubmit = racine.querySelector<HTMLButtonElement>('.user-form__submit')!;
    expect(boutonSubmit.querySelector('.pi-spinner')).toBeTruthy();
    expect(boutonSubmit.querySelector('.pi-check')).toBeNull();
    expect(boutonSubmit.disabled).toBe(true);

    resolve(user());
    await flush();
    fixture.detectChanges();

    expect(boutonSubmit.querySelector('.pi-check')).toBeTruthy();
    expect(boutonSubmit.querySelector('.pi-spinner')).toBeNull();
  });

  it('clic réel sur Annuler garde un lien routable vers /utilisateurs', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    const lienAnnuler = racine.querySelector<HTMLAnchorElement>('.user-form__cancel')!;
    expect(lienAnnuler).toBeTruthy();
    expect(lienAnnuler.textContent).toContain('CANCEL');
  });
});

describe('UtilisateurFormComponent — rendu réel (édition)', () => {
  it('affiche le titre et l’état de chargement en mode édition avant résolution', async () => {
    const { fixture } = monter({ routeId: 'u-1' });
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.user-form-page__title')?.textContent).toContain('EDIT_TITLE');
    expect(racine.querySelector('.user-form-page__loading')).toBeTruthy();

    await flush();
    fixture.detectChanges();
    expect(racine.querySelector('.user-form-page__loading')).toBeNull();
    // Pas de champ « identifiant » en édition (lecture seule côté fiche).
    expect(racine.querySelector('#username')).toBeNull();
  });

  it('modifie un utilisateur existant depuis les vrais champs puis soumet', async () => {
    const { fixture, updateUser } = monter({ routeId: 'u-1' });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const champPhone = racine.querySelector<HTMLInputElement>('#phoneNumber')!;
    champPhone.value = '698765432';
    champPhone.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    racine.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flush();

    expect(updateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ phoneNumber: '+237698765432' }));
  });
});
