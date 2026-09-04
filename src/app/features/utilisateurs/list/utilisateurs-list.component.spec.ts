import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { ConfirmationService } from 'primeng/api';
import { Subject, of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { UtilisateursListComponent } from './utilisateurs-list.component';
import { UsersService } from '../../../core/users/users.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { User } from '../../../shared/models/user.model';

const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };

/**
 * Liste des comptes utilisateurs — le seul écran où deux administrateurs
 * travaillent couramment en parallèle. Ces tests portent sur la mise à jour en
 * direct des comptes (création en tête, mise à jour en place), sur les
 * filtres/recherche, et sur le fait qu'une désactivation exige une
 * confirmation explicite avant tout appel réseau.
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
  getUsers?: ReturnType<typeof vi.fn>;
  deactivateUser?: ReturnType<typeof vi.fn>;
  reactivateUser?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
  const getUsers = over.getUsers ?? vi.fn().mockResolvedValue([]);
  const deactivateUser = over.deactivateUser ?? vi.fn().mockResolvedValue(user({ isActive: false }));
  const reactivateUser = over.reactivateUser ?? vi.fn().mockResolvedValue(user({ isActive: true }));

  TestBed.configureTestingModule({
    imports: [UtilisateursListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: UsersService, useValue: { getUsers, deactivateUser, reactivateUser } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Apollo, useValue: { ...apolloStub, subscribe: over.subscribe ?? apolloStub.subscribe } },
    ],
  });
  const fixture = TestBed.createComponent(UtilisateursListComponent);
  const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
  return { fixture, c: fixture.componentInstance, deactivateUser, reactivateUser, confirmationService };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('UtilisateursListComponent — chargement et filtres', () => {
  it('charge la liste au montage', async () => {
    const { fixture, c } = monter({ getUsers: vi.fn().mockResolvedValue([user()]) });
    fixture.detectChanges();
    await flush();
    expect(c.users()).toHaveLength(1);
  });

  it('recherche par identifiant, e-mail ou téléphone', async () => {
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([
        user({ id: 'u-1', username: 'ngo.awa' }),
        user({ id: 'u-2', username: 'jean.k', email: 'jean@x.com' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    c.searchTerm.set('ngo');
    expect(c.filteredUsers().map((u) => u.id)).toEqual(['u-1']);
  });

  it('filtre par rôle et statut combinés', async () => {
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([
        user({ id: 'u-1', role: 'AGENT', isActive: true }),
        user({ id: 'u-2', role: 'AGENT', isActive: false }),
        user({ id: 'u-3', role: 'COMPTABLE', isActive: true }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    c.onFiltersChange({ role: 'AGENT', statut: 'INACTIF' });
    expect(c.filteredUsers().map((u) => u.id)).toEqual(['u-2']);
  });

  it('affiche un message vide différent selon qu’une recherche est active', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    const sansRecherche = c.emptyMsg();
    c.searchTerm.set('zzz');
    // Sans traduction chargée, `instant` renvoie la clé — c'est elle qui doit
    // changer entre les deux messages (recherche active ou non).
    expect(c.emptyMsg()).not.toBe(sansRecherche);
  });
});

describe('UtilisateursListComponent — désactivation', () => {
  it('n’appelle le service qu’après confirmation explicite', async () => {
    const { fixture, c, deactivateUser, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user()]),
    });
    fixture.detectChanges();
    await flush();

    // Sans interaction avec la boîte de dialogue, `confirm()` ne rappelle pas
    // `accept` de lui-même — aucun appel réseau ne doit avoir eu lieu.
    vi.spyOn(confirmationService, 'confirm');
    c.confirmDeactivate(c.users()[0]);
    expect(deactivateUser).not.toHaveBeenCalled();

    // Simule le clic sur « Désactiver » dans la boîte de dialogue.
    const options = (confirmationService.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
    options.accept();
    await flush();

    expect(deactivateUser).toHaveBeenCalledWith('u-1');
  });

  it('met à jour la ligne en place après désactivation', async () => {
    const { fixture, c, confirmationService } = monter({ getUsers: vi.fn().mockResolvedValue([user()]) });
    fixture.detectChanges();
    await flush();
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    c.confirmDeactivate(c.users()[0]);
    await flush();

    expect(c.users()[0].isActive).toBe(false);
  });

  it('réactive un compte', async () => {
    const { fixture, c, reactivateUser } = monter({ getUsers: vi.fn().mockResolvedValue([user({ isActive: false })]) });
    fixture.detectChanges();
    await flush();
    await c.reactivate(c.users()[0]);
    expect(reactivateUser).toHaveBeenCalledWith('u-1');
    expect(c.users()[0].isActive).toBe(true);
  });
});

describe('UtilisateursListComponent — mise à jour en direct', () => {
  it('insère un compte nouvellement créé en tête de liste', async () => {
    const evenements = new Subject<{ data: { utilisateurUpdated: User | null } }>();
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-1' })]),
      subscribe: vi.fn().mockReturnValue(evenements),
    });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { utilisateurUpdated: user({ id: 'u-2', username: 'nouveau' }) } });

    expect(c.users()[0].id).toBe('u-2');
    expect(c.users()).toHaveLength(2);
  });

  it('met à jour un compte existant en place, sans dupliquer', async () => {
    const evenements = new Subject<{ data: { utilisateurUpdated: User | null } }>();
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-1', role: 'AGENT' })]),
      subscribe: vi.fn().mockReturnValue(evenements),
    });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { utilisateurUpdated: user({ id: 'u-1', role: 'COMPTABLE' }) } });

    expect(c.users()).toHaveLength(1);
    expect(c.users()[0].role).toBe('COMPTABLE');
  });
});

describe('UtilisateursListComponent — présentation', () => {
  it('initial() renvoie la première lettre en majuscule', () => {
    const { c } = monter();
    expect(c.initial(user({ username: 'zoe' }))).toBe('Z');
  });
});
