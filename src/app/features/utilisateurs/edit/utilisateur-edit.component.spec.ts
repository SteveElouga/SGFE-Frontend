import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
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
          params: of(
            (() => {
              const id = 'routeId' in over ? over.routeId : 'u-1';
              return id === null ? {} : { id };
            })(),
          ),
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

/**
 * Rendu réel du template : les tests ci-dessus n'appelaient jamais
 * `detectChanges()` après la résolution de `load()`, donc `@if (user())` et
 * tout ce qu'il contient (identité, canal, statut, sécurité, dialog) n'était
 * jamais effectivement rendu. Ceux-ci le font, puis interagissent avec le DOM.
 */
describe('UtilisateurEditComponent — rendu du squelette et des états de chargement', () => {
  it('affiche le squelette pendant le chargement puis le remplace par la fiche', async () => {
    const { fixture } = monter();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.uedit-skeleton')).toBeTruthy();

    await flush();
    fixture.detectChanges();

    expect(racine.querySelector('.uedit-skeleton')).toBeNull();
    expect(racine.querySelector('.uedit-identity')).toBeTruthy();
  });

  it('affiche l’état introuvable avec un lien de retour', async () => {
    const { fixture } = monter({ users: [] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const bloc = racine.querySelector('.uedit-notfound');
    expect(bloc).toBeTruthy();
    expect(bloc?.querySelector('.uedit-notfound__link')).toBeTruthy();
    expect(racine.querySelector('.uedit-identity')).toBeNull();
  });
});

describe('UtilisateurEditComponent — rendu de la fiche chargée', () => {
  it('affiche l’identité, le statut actif et le canal WhatsApp pour un non-ADMIN', async () => {
    const { fixture } = monter({ users: [user({ role: 'AGENT', isActive: true, username: 'ngo.awa' })] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.uedit-avatar')?.textContent?.trim()).toBe('N');
    expect(racine.querySelector('.uedit-identity__name')?.textContent?.trim()).toBe('ngo.awa');
    expect(racine.querySelector('.uedit-status-pill--off')).toBeNull();
    expect(racine.querySelector('.uedit-status-pill')?.textContent).toContain('ACCOUNT_ACTIVE');
    // Canal WhatsApp (non-ADMIN) : pas de classe --email, pas de section email requise.
    expect(racine.querySelector('.uedit-channel--email')).toBeNull();
    expect(racine.querySelector('.uedit-channel__label')?.textContent).toContain('CHANNEL_WHATSAPP');
    // Le bouton « Désactiver » est proposé pour un compte actif, pas « Réactiver ».
    expect(racine.textContent).toContain('DESACTIVER');
  });

  it('affiche le canal e-mail et le statut inactif pour un ADMIN désactivé', async () => {
    const { fixture } = monter({ users: [user({ role: 'ADMIN', isActive: false })] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.uedit-status-pill--off')).toBeTruthy();
    expect(racine.querySelector('.uedit-status-pill')?.textContent).toContain('ACCOUNT_INACTIVE');
    expect(racine.querySelector('.uedit-channel--email')).toBeTruthy();
    expect(racine.querySelector('.uedit-channel__label')?.textContent).toContain('CHANNEL_EMAIL');
    // Le bouton « Réactiver » remplace « Désactiver » pour un compte inactif.
    expect(racine.querySelector('.uedit-btn--success')).toBeTruthy();
    expect(racine.querySelector('.uedit-btn--danger-soft')).toBeNull();
  });

  it('reflète la saisie du téléphone dans le DOM (classe invalide puis valide)', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const phoneInput = racine.querySelector<HTMLInputElement>('#uedit-phone')!;

    phoneInput.value = '12';
    phoneInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(c.phone()).toBe('12');
    expect(racine.querySelector('.uedit-phone--invalid')).toBeTruthy();
    const boutonSauver = racine.querySelector<HTMLButtonElement>('.uedit-footer .uedit-btn--primary')!;
    expect(boutonSauver.disabled).toBe(true);

    phoneInput.value = '698765432';
    phoneInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(racine.querySelector('.uedit-phone--valid')).toBeTruthy();
    expect(racine.querySelector('.uedit-phone--invalid')).toBeNull();
    expect(boutonSauver.disabled).toBe(false);
  });

  it('enregistre depuis un vrai clic sur le bouton Enregistrer et affiche l’erreur au refus', async () => {
    const { fixture, c, updateUser } = monter({
      updateUser: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'x', extensions: { code: 'PERMISSION_DENIED' } }]),
      ),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const phoneInput = racine.querySelector<HTMLInputElement>('#uedit-phone')!;
    phoneInput.value = '698765432';
    phoneInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonSauver = racine.querySelector<HTMLButtonElement>('.uedit-footer .uedit-btn--primary')!;
    expect(boutonSauver.disabled).toBe(false);
    boutonSauver.click();
    await flush();
    fixture.detectChanges();

    expect(updateUser).toHaveBeenCalled();
    expect(c.saving()).toBe(false);
    const erreur = racine.querySelector('.uedit-error');
    expect(erreur?.textContent).toContain('UNAUTHORIZED');
  });

  it('clic sur Annuler ramène à la liste des utilisateurs', async () => {
    const { fixture, navigateByUrl } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutonAnnuler = racine.querySelector<HTMLButtonElement>('.uedit-footer .uedit-btn--ghost')!;
    boutonAnnuler.click();

    expect(navigateByUrl).toHaveBeenCalledWith('/utilisateurs');
  });

  it('clic sur le bouton retour de la topbar ramène à la liste', async () => {
    const { fixture, navigateByUrl } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.uedit-back')!.click();

    expect(navigateByUrl).toHaveBeenCalledWith('/utilisateurs');
  });

  it('renvoi de l’activation depuis le vrai bouton de la carte identité', async () => {
    const { fixture, resetUserPassword } = monter({ users: [user({ role: 'ADMIN' })] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutonRenvoi = racine.querySelector<HTMLButtonElement>('.uedit-identity .uedit-btn--outline-primary')!;
    boutonRenvoi.click();
    await flush();
    fixture.detectChanges();

    expect(resetUserPassword).toHaveBeenCalledWith('u-1');
  });
});

describe('UtilisateurEditComponent — dialog de désactivation (rendu réel)', () => {
  it('ouvre le dialog au clic, ferme sur Annuler sans appel réseau', async () => {
    const { fixture, c, deactivateUser } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.uedit-row .uedit-btn--danger-soft')!.click();
    fixture.detectChanges();

    expect(c.deactivateDialogVisible()).toBe(true);
    const titre = document.body.querySelector('.udeact-header__title');
    expect(titre?.textContent).toContain('ngo.awa');

    const boutonAnnulerDialog = document.body.querySelector<HTMLButtonElement>('.udeact-footer .uedit-btn--ghost')!;
    boutonAnnulerDialog.click();
    fixture.detectChanges();

    expect(c.deactivateDialogVisible()).toBe(false);
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it('confirme la désactivation depuis le vrai bouton du dialog et met à jour la pastille de statut', async () => {
    const { fixture, deactivateUser } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.uedit-row .uedit-btn--danger-soft')!.click();
    fixture.detectChanges();

    const boutonConfirmer = document.body.querySelector<HTMLButtonElement>('.udeact-footer .uedit-btn--danger')!;
    boutonConfirmer.click();
    await flush();
    fixture.detectChanges();

    expect(deactivateUser).toHaveBeenCalledWith('u-1');
    expect(racine.querySelector('.uedit-status-pill--off')).toBeTruthy();
  });
});

describe('UtilisateurEditComponent — cas limites et replis génériques', () => {
  it('signale aussi l’utilisateur introuvable quand le chargement lève une exception', async () => {
    const getUsers = vi.fn().mockRejectedValue(new Error('réseau indisponible'));
    TestBed.configureTestingModule({
      imports: [UtilisateurEditComponent],
      providers: [
        provideTranslateService({}),
        { provide: Router, useValue: { navigateByUrl: vi.fn(), navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'u-1' }) } },
        { provide: UsersService, useValue: { getUsers, updateUser: vi.fn(), deactivateUser: vi.fn(), reactivateUser: vi.fn(), resetUserPassword: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(UtilisateurEditComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    await flush();
    expect(c.notFound()).toBe(true);
    expect(c.loading()).toBe(false);
  });

  it('initials() renvoie "?" tant qu’aucun utilisateur n’est chargé, ou si le nom est vide', async () => {
    const { fixture, c } = monter({ users: [user({ username: '' })] });
    expect(c.initials()).toBe('?'); // avant chargement
    fixture.detectChanges();
    await flush();
    expect(c.initials()).toBe('?'); // nom d'utilisateur vide
  });

  it('save() retombe sur le message générique pour un code d’erreur inconnu sans message exploitable', async () => {
    const { fixture, c } = monter({
      updateUser: vi.fn().mockRejectedValue(new Error()),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    c.role.set('COMPTABLE');
    await c.save();
    expect(c.errorMessage()).toContain('GENERIC');
  });

  it('save() envoie email: undefined quand le champ e-mail est vidé', async () => {
    const { fixture, c, updateUser } = monter({ users: [user({ role: 'AGENT' })] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    c.email.set('');
    c.role.set('COMPTABLE');
    await c.save();
    expect(updateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ email: undefined }));
  });

  it('doDeactivate() ne fait rien tant qu’aucun utilisateur n’est chargé', async () => {
    const { fixture, c, deactivateUser } = monter();
    fixture.detectChanges(); // avant flush() : c.user() est encore null
    await c.doDeactivate();
    expect(deactivateUser).not.toHaveBeenCalled();
    expect(c.statutLoading()).toBe(false);
  });

  it('reactivate() ne fait rien tant qu’aucun utilisateur n’est chargé', async () => {
    const { fixture, c, reactivateUser } = monter();
    fixture.detectChanges();
    await c.reactivate();
    expect(reactivateUser).not.toHaveBeenCalled();
  });

  it('resendActivation() ne fait rien tant qu’aucun utilisateur n’est chargé', async () => {
    const { fixture, c, resetUserPassword } = monter();
    fixture.detectChanges();
    await c.resendActivation();
    expect(resetUserPassword).not.toHaveBeenCalled();
  });

  it('doDeactivate affiche le message générique du toast quand le serveur n’en fournit aucun', async () => {
    const { fixture, c } = monter({ deactivateUser: vi.fn().mockRejectedValue(new Error()) });
    fixture.detectChanges();
    await flush();
    await c.doDeactivate();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'));
  });

  it('reactivate affiche le message générique du toast quand le serveur n’en fournit aucun', async () => {
    const { fixture, c } = monter({ reactivateUser: vi.fn().mockRejectedValue(new Error()) });
    fixture.detectChanges();
    await flush();
    await c.reactivate();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'));
  });

  it('resendActivation affiche le message générique du toast quand le serveur n’en fournit aucun', async () => {
    const { fixture, c } = monter({ resetUserPassword: vi.fn().mockRejectedValue(new Error()) });
    fixture.detectChanges();
    await flush();
    await c.resendActivation();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'));
  });

  it('affiche "SAVING" pendant l’enregistrement en cours, dans le vrai DOM du bouton', async () => {
    let resolve!: (u: User) => void;
    const enVol = new Promise<User>((r) => (resolve = r));
    const { fixture, c } = monter({ updateUser: vi.fn().mockReturnValue(enVol) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    c.role.set('COMPTABLE');
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutonSauver = racine.querySelector<HTMLButtonElement>('.uedit-footer .uedit-btn--primary')!;
    boutonSauver.click();
    fixture.detectChanges();

    expect(boutonSauver.textContent).toContain('SAVING');

    resolve(user({ role: 'COMPTABLE' }));
    await flush();
    fixture.detectChanges();

    expect(boutonSauver.textContent).toContain('EDIT.SAVE');
    expect(boutonSauver.textContent).not.toContain('SAVING');
  });

  it('modifie l’e-mail et réactive un compte inactif depuis de vrais éléments du DOM', async () => {
    const { fixture, c, reactivateUser } = monter({ users: [user({ role: 'ADMIN', isActive: false })] });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const emailInput = racine.querySelector<HTMLInputElement>('#uedit-email')!;
    emailInput.value = 'nouveau@x.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.email()).toBe('nouveau@x.com');

    const boutonReactiver = racine.querySelector<HTMLButtonElement>('.uedit-row .uedit-btn--success')!;
    boutonReactiver.click();
    await flush();
    fixture.detectChanges();

    expect(reactivateUser).toHaveBeenCalledWith('u-1');
    expect(racine.querySelector('.uedit-status-pill--off')).toBeNull();
  });

  it('préremplit un champ e-mail vide quand l’utilisateur n’en a aucun', async () => {
    const { fixture, c } = monter({ users: [user({ role: 'AGENT', email: undefined as unknown as string })] });
    fixture.detectChanges();
    await flush();
    expect(c.email()).toBe('');
  });

  it('save() ne fait rien si l’identifiant utilisateur n’est pas encore disponible', async () => {
    const { fixture, c, updateUser } = monter();
    fixture.detectChanges(); // user() est encore null : load() n'a pas eu le temps de résoudre
    c.phone.set('698765432'); // rend canSave() vrai sans utilisateur chargé
    expect(c.canSave()).toBe(true);
    await c.save();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('renvoi de l’activation depuis le bouton dédié de la carte Sécurité', async () => {
    const { fixture, resetUserPassword } = monter();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const cartesRow = Array.from(racine.querySelectorAll('.uedit-row'));
    const carteSecurite = cartesRow.find((c) => c.textContent?.includes('SECTION_SECURITY'))!;
    carteSecurite.querySelector<HTMLButtonElement>('.uedit-btn--outline')!.click();
    await flush();

    expect(resetUserPassword).toHaveBeenCalledWith('u-1');
  });
});
