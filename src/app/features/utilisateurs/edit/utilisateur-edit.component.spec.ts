import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { UtilisateurEditComponent } from './utilisateur-edit.component';
import { UsersService } from '../../../core/users/users.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { User } from '../../../shared/models/user.model';

/**
 * Fiche de modification d'un utilisateur : e-mail requis seulement pour un
 * ADMIN (canal d'activation par e-mail), numéro camerounais valide sinon,
 * suivi des modifications réelles (`isDirty`) et actions de statut du compte.
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
  users?: User[];
  routeId?: string | null;
  updateUser?: ReturnType<typeof vi.fn>;
  deactivateUser?: ReturnType<typeof vi.fn>;
  reactivateUser?: ReturnType<typeof vi.fn>;
  resetUserPassword?: ReturnType<typeof vi.fn>;
} = {}) {
  const getUsers = vi.fn().mockResolvedValue(over.users ?? [user()]);
  const updateUser = over.updateUser ?? vi.fn().mockResolvedValue(user());
  const deactivateUser = over.deactivateUser ?? vi.fn().mockResolvedValue(user({ isActive: false }));
  const reactivateUser = over.reactivateUser ?? vi.fn().mockResolvedValue(user({ isActive: true }));
  const resetUserPassword = over.resetUserPassword ?? vi.fn().mockResolvedValue(user());
  const navigateByUrl = vi.fn();

  TestBed.configureTestingModule({
    imports: [UtilisateurEditComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigateByUrl, navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: (() => {
              const id = 'routeId' in over ? over.routeId : 'u-1';
              return new Map(id === null ? [] : [['id', id]]);
            })(),
          },
        },
      },
      { provide: UsersService, useValue: { getUsers, updateUser, deactivateUser, reactivateUser, resetUserPassword } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(UtilisateurEditComponent);
  return { fixture, c: fixture.componentInstance, updateUser, deactivateUser, reactivateUser, resetUserPassword, navigateByUrl };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('UtilisateurEditComponent — chargement', () => {
  it('précharge les champs depuis l’utilisateur trouvé', async () => {
    const { fixture, c } = monter({ users: [user({ phoneNumber: '+237698765432', email: 'test@x.com' })] });
    fixture.detectChanges();
    await flush();
    expect(c.phone()).toBe('698765432');
    expect(c.email()).toBe('test@x.com');
    expect(c.loading()).toBe(false);
  });

  it('redirige immédiatement sans id de route', () => {
    const { fixture, navigateByUrl } = monter({ routeId: null });
    fixture.detectChanges();
    expect(navigateByUrl).toHaveBeenCalledWith('/utilisateurs');
  });

  it('signale l’utilisateur introuvable', async () => {
    const { fixture, c } = monter({ users: [] });
    fixture.detectChanges();
    await flush();
    expect(c.notFound()).toBe(true);
  });
});

describe('UtilisateurEditComponent — validation', () => {
  it('e-mail requis uniquement pour un ADMIN', async () => {
    const { fixture, c } = monter({ users: [user({ role: 'AGENT', email: '' })] });
    fixture.detectChanges();
    await flush();
    expect(c.emailValid()).toBe(true);

    c.role.set('ADMIN');
    expect(c.emailValid()).toBe(false);
    c.email.set('admin@x.com');
    expect(c.emailValid()).toBe(true);
  });

  it('canSave exige une modification réelle', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.isDirty()).toBe(false);
    expect(c.canSave()).toBe(false);
    c.role.set('COMPTABLE');
    expect(c.isDirty()).toBe(true);
    expect(c.canSave()).toBe(true);
  });

  it('canSave refuse un numéro invalide', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.phone.set('12');
    expect(c.canSave()).toBe(false);
  });

  it('channelIsEmail ne vaut vrai que pour ADMIN', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.channelIsEmail()).toBe(false);
    c.role.set('ADMIN');
    expect(c.channelIsEmail()).toBe(true);
  });
});

describe('UtilisateurEditComponent — sauvegarde', () => {
  it('envoie exactement les champs modifiés, normalisés', async () => {
    const { fixture, c, updateUser } = monter();
    fixture.detectChanges();
    await flush();
    c.phone.set('698765432');
    c.role.set('COMPTABLE');
    await c.save();
    expect(updateUser).toHaveBeenCalledWith('u-1', {
      email: 'awa@example.com',
      phoneNumber: '+237698765432',
      role: 'COMPTABLE',
    });
  });

  it('ne sauvegarde rien si rien n’a changé', async () => {
    const { fixture, c, updateUser } = monter();
    fixture.detectChanges();
    await flush();
    await c.save();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('affiche un message dédié sur un doublon (téléphone/nom déjà pris)', async () => {
    const { fixture, c } = monter({
      updateUser: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'x', extensions: { code: 'ALREADY_EXISTS' } }])),
    });
    fixture.detectChanges();
    await flush();
    c.role.set('COMPTABLE');
    await c.save();
    expect(c.errorMessage()).toBeTruthy();
    expect(c.saving()).toBe(false);
  });

  it('resynchronise les valeurs d’origine après un enregistrement réussi', async () => {
    const { fixture, c } = monter({ updateUser: vi.fn().mockResolvedValue(user({ role: 'SUPERVISEUR' })) });
    fixture.detectChanges();
    await flush();
    c.role.set('SUPERVISEUR');
    await c.save();
    expect(c.isDirty()).toBe(false); // la nouvelle valeur devient la référence
  });
});

describe('UtilisateurEditComponent — statut du compte', () => {
  it('désactive le compte et ferme la boîte de dialogue', async () => {
    const { fixture, c, deactivateUser } = monter();
    fixture.detectChanges();
    await flush();
    c.confirmDeactivate();
    expect(c.deactivateDialogVisible()).toBe(true);
    await c.doDeactivate();
    expect(deactivateUser).toHaveBeenCalledWith('u-1');
    expect(c.deactivateDialogVisible()).toBe(false);
    expect(c.user()?.isActive).toBe(false);
  });

  it('réactive uniquement si la capacité backend est prête', async () => {
    const { fixture, c, reactivateUser } = monter();
    fixture.detectChanges();
    await flush();
    await c.reactivate();
    // ACTIVATION_ACTIONS est à true dans backend-capabilities.ts (livré).
    expect(reactivateUser).toHaveBeenCalledWith('u-1');
  });

  it('resendActivation choisit le libellé selon le rôle (e-mail pour ADMIN)', async () => {
    const { fixture, c, resetUserPassword } = monter({ users: [user({ role: 'ADMIN' })] });
    fixture.detectChanges();
    await flush();
    await c.resendActivation();
    expect(resetUserPassword).toHaveBeenCalledWith('u-1');
    expect(c.resendLoading()).toBe(false);
  });
});
