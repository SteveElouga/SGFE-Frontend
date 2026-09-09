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

  it('ne réactive pas deux fois pendant qu’une réactivation est déjà en vol', async () => {
    let resoudre!: (v: User) => void;
    const reactivateUser = vi.fn(() => new Promise<User>((r) => { resoudre = r; }));
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ isActive: false })]),
      reactivateUser,
    });
    fixture.detectChanges();
    await flush();

    const p1 = c.reactivate(c.users()[0]);
    const p2 = c.reactivate(c.users()[0]); // double clic pendant l'envoi
    resoudre(user({ isActive: true }));
    await Promise.all([p1, p2]);

    expect(reactivateUser).toHaveBeenCalledTimes(1);
  });

  it('un échec de réactivation relève le verrou', async () => {
    const reactivateUser = vi.fn().mockRejectedValueOnce(new Error('indisponible'));
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ isActive: false })]),
      reactivateUser,
    });
    fixture.detectChanges();
    await flush();

    await c.reactivate(c.users()[0]);

    expect(c.statutEnCoursId()).toBeNull();
  });

  it('affiche un spinner et désactive le bouton pendant la réactivation en vol', async () => {
    let resoudre!: (v: User) => void;
    const reactivateUser = vi.fn(() => new Promise<User>((r) => { resoudre = r; }));
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-9', isActive: false })]),
      reactivateUser,
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const bouton = racine.querySelector('.users-table__action-btn--success') as HTMLButtonElement;

    bouton.click();
    fixture.detectChanges();

    expect(bouton.disabled).toBe(true);
    expect(bouton.querySelector('.pi-spin.pi-spinner')).toBeTruthy();

    resoudre(user({ id: 'u-9', isActive: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    // Le succès bascule `isActive` : le bouton "Réactiver" est remplacé par
    // "Désactiver" dans le DOM (branche `@if`/`@else`) — c'est le verrou côté
    // composant qu'il faut vérifier, pas une référence DOM devenue caduque.
    expect(c.statutEnCoursId()).toBeNull();
  });

  it('affiche un spinner et désactive le bouton pendant la désactivation en vol', async () => {
    let resoudre!: (v: User) => void;
    const deactivateUser = vi.fn(() => new Promise<User>((r) => { resoudre = r; }));
    const { fixture, c, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-9', isActive: true })]),
      deactivateUser,
    });
    fixture.detectChanges();
    await flush();
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const bouton = racine.querySelector('.users-table__action-btn--danger') as HTMLButtonElement;

    bouton.click();
    fixture.detectChanges();

    expect(bouton.disabled).toBe(true);
    expect(bouton.querySelector('.pi-spin.pi-spinner')).toBeTruthy();

    resoudre(user({ id: 'u-9', isActive: false }));
    await fixture.whenStable();
    fixture.detectChanges();

    // Le succès bascule `isActive` : le bouton "Désactiver" est remplacé par
    // "Réactiver" dans le DOM (branche `@if`/`@else`) — c'est le verrou côté
    // composant qu'il faut vérifier, pas une référence DOM devenue caduque.
    expect(c.statutEnCoursId()).toBeNull();
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

/**
 * Rendu réel du tableau : les tests ci-dessus n'appelaient jamais
 * `detectChanges()` après la résolution de `loadUsers()`, donc les
 * `ng-template appCol="…"` de ce composant (avatar, e-mail, pastille de rôle,
 * date, statut, actions) n'étaient jamais effectivement instanciés par
 * `app-data-table`. Ceux-ci le font, puis interagissent avec de vrais boutons.
 */
describe('UtilisateursListComponent — rendu réel du tableau', () => {
  it('affiche une ligne active avec e-mail, badge et bouton Désactiver', async () => {
    const { fixture } = monter({
      getUsers: vi.fn().mockResolvedValue([
        user({ id: 'u-1', username: 'ngo.awa', email: 'awa@x.com', role: 'AGENT', isActive: true }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.users-table__username')?.textContent?.trim()).toBe('ngo.awa');
    expect(racine.querySelector('.users-table__avatar')?.textContent?.trim()).toBe('N');
    expect(racine.querySelector('.users-table__email')?.textContent?.trim()).toBe('awa@x.com');
    expect(racine.querySelector('.role-pill')?.textContent).toContain('AGENT');
    expect(racine.querySelector('.users-table__user--off')).toBeNull();

    // Colonne actions (vue desktop) : « Voir » + « Désactiver », pas « Réactiver ».
    const actions = racine.querySelector('.users-table__actions')!;
    expect(actions.querySelector('.users-table__action-btn--danger')).toBeTruthy();
    expect(actions.querySelector('.users-table__action-btn--success')).toBeNull();
    const lienVoir = actions.querySelector('a.users-table__action-btn');
    expect(lienVoir).toBeTruthy();
    expect(lienVoir?.getAttribute('aria-label')).toContain('ngo.awa');
  });

  it('affiche « — » pour un e-mail absent et le bouton Réactiver pour un compte inactif', async () => {
    const { fixture } = monter({
      getUsers: vi.fn().mockResolvedValue([
        user({ id: 'u-2', username: 'jean.k', email: undefined as unknown as string, role: 'ADMIN', isActive: false }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.users-table__email')?.textContent?.trim()).toBe('—');
    expect(racine.querySelector('.users-table__user--off')).toBeTruthy();
    expect(racine.querySelector('.role-pill--off')).toBeTruthy();

    const actions = racine.querySelector('.users-table__actions')!;
    expect(actions.querySelector('.users-table__action-btn--success')).toBeTruthy();
    expect(actions.querySelector('.users-table__action-btn--danger')).toBeNull();

    // Pastille de statut : app-badge avec le ton neutre et le libellé INACTIF.
    expect(racine.querySelector('app-badge')?.textContent).toContain('INACTIF');
  });

  it('la carte mobile (appCardRow) reflète aussi le statut et se met à jour après réactivation', async () => {
    const { fixture, reactivateUser } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-3', username: 'awa', isActive: false })]),
      reactivateUser: vi.fn().mockResolvedValue(user({ id: 'u-3', username: 'awa', isActive: true })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const carte = racine.querySelector('.ucard')!;
    expect(carte.classList.contains('ucard--off')).toBe(true);
    expect(carte.querySelector('.statut-dot--off')).toBeTruthy();

    carte.querySelector<HTMLButtonElement>('.users-table__action-btn--success')!.click();
    await flush();
    fixture.detectChanges();

    expect(reactivateUser).toHaveBeenCalledWith('u-3');
    expect(racine.querySelector('.ucard')?.classList.contains('ucard--off')).toBe(false);
  });

  it('clic réel sur Désactiver ouvre la confirmation puis retire le bouton Réactiver après refus d’annuler', async () => {
    const { fixture, deactivateUser, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-1', isActive: true })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    racine.querySelector<HTMLButtonElement>('.users-table__action-btn--danger')!.click();
    await flush();
    fixture.detectChanges();

    expect(deactivateUser).toHaveBeenCalledWith('u-1');
    expect(racine.querySelector('.users-table__action-btn--danger')).toBeNull();
    expect(racine.querySelector('.users-table__action-btn--success')).toBeTruthy();
  });

  it('clic sur l’icône Modifier de la carte mobile navigue vers la fiche', async () => {
    const { fixture } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-9' })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const router = TestBed.inject(Router) as unknown as { navigateByUrl: ReturnType<typeof vi.fn> };
    const racine = fixture.nativeElement as HTMLElement;
    racine.querySelector<HTMLButtonElement>('.ucard .users-table__action-btn')!.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/utilisateurs/u-9');
  });

  it('affiche le bandeau d’erreur et relance le chargement au clic sur Réessayer', async () => {
    const getUsers = vi.fn()
      .mockRejectedValueOnce(new Error('Panne serveur'))
      .mockResolvedValueOnce([user()]);
    const { fixture } = monter({ getUsers });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const banniere = racine.querySelector('app-error-banner');
    expect(banniere).toBeTruthy();
    expect(banniere?.textContent).toContain('Panne serveur');

    const boutonReessayer = banniere!.querySelector<HTMLButtonElement>('button')!;
    boutonReessayer.click();
    await flush();
    fixture.detectChanges();

    expect(getUsers).toHaveBeenCalledTimes(2);
    expect(racine.querySelector('app-error-banner')).toBeNull();
  });

  it('la recherche tapée dans le vrai champ filtre le tableau après le debounce', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, c } = monter({
        getUsers: vi.fn().mockResolvedValue([
          user({ id: 'u-1', username: 'ngo.awa' }),
          user({ id: 'u-2', username: 'jean.k' }),
        ]),
      });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const racine = fixture.nativeElement as HTMLElement;
      const champRecherche = racine.querySelector<HTMLInputElement>('.fp__search input')!;
      champRecherche.value = 'ngo';
      champRecherche.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(300);
      await flush();
      fixture.detectChanges();

      expect(c.searchTerm()).toBe('ngo');
      expect(c.filteredUsers().map((u) => u.id)).toEqual(['u-1']);
      // La classe `.users-table__username` apparaît deux fois par ligne filtrée :
      // une fois dans la cellule desktop, une fois dans la carte mobile.
      const lignes = racine.querySelectorAll('.users-table__username');
      expect(lignes.length).toBe(2);
      lignes.forEach((el) => expect(el.textContent?.trim()).toBe('ngo.awa'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('clic réel sur Réactiver (vue desktop) et sur Désactiver (carte mobile)', async () => {
    const { fixture, reactivateUser, deactivateUser, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ id: 'u-4', isActive: false })]),
      reactivateUser: vi.fn().mockResolvedValue(user({ id: 'u-4', isActive: true })),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    // Bouton « Réactiver » de la cellule desktop (premier du DOM, avant la carte).
    racine.querySelector<HTMLButtonElement>('.users-table__actions .users-table__action-btn--success')!.click();
    await flush();
    fixture.detectChanges();
    expect(reactivateUser).toHaveBeenCalledWith('u-4');

    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });
    // L'utilisateur est maintenant actif : la carte mobile expose « Désactiver ».
    racine.querySelector<HTMLButtonElement>('.ucard .users-table__action-btn--danger')!.click();
    await flush();

    expect(deactivateUser).toHaveBeenCalledWith('u-4');
  });

  it('trie les lignes par en-tête cliquable, sur les cinq colonnes triables', async () => {
    const { fixture } = monter({
      getUsers: vi.fn().mockResolvedValue([
        user({ id: 'u-1', username: 'zoe', email: 'z@x.com', role: 'AGENT', isActive: true, createdAt: '2026-01-01' }),
        user({ id: 'u-2', username: 'awa', email: 'a@x.com', role: 'ADMIN', isActive: false, createdAt: '2026-02-01' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const enTetes = Array.from(racine.querySelectorAll<HTMLButtonElement>('.dt__sort-btn'));
    // username, email, role, createdAt, statut : les cinq colonnes triables du tableau.
    expect(enTetes.length).toBe(5);

    // Tri par identifiant (asc) : « awa » doit passer devant « zoe ».
    enTetes[0].click();
    fixture.detectChanges();
    let usernames = Array.from(racine.querySelectorAll('.users-table__username')).map((el) => el.textContent?.trim());
    expect(usernames[0]).toBe('awa');

    // Les quatre autres colonnes triables (email, rôle, date, statut) : chaque
    // `sortValue` doit s'exécuter sans lever d'exception.
    for (const bouton of enTetes.slice(1)) {
      expect(() => {
        bouton.click();
        fixture.detectChanges();
      }).not.toThrow();
    }
  });
});

describe('UtilisateursListComponent — replis génériques', () => {
  it('onFiltersChange retombe sur les valeurs par défaut si role/statut sont absents', () => {
    const { c } = monter();
    c.onFiltersChange({ role: 'AGENT', statut: 'ACTIF' });
    expect(c.filtreRole()).toBe('AGENT');
    expect(c.filtreStatut()).toBe('ACTIF');

    c.onFiltersChange({});
    expect(c.filtreRole()).toBeNull();
    expect(c.filtreStatut()).toBe('TOUS');
  });

  it('filterValues reflète un statut différent de TOUS', () => {
    const { c } = monter();
    c.onFiltersChange({ statut: 'INACTIF' });
    expect(c.filterValues()['statut']).toBe('INACTIF');
  });

  it('affiche le message d’erreur générique du toast si la désactivation échoue sans message serveur', async () => {
    const { fixture, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user()]),
      deactivateUser: vi.fn().mockRejectedValue(new Error()),
    });
    fixture.detectChanges();
    await flush();
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    fixture.componentInstance.confirmDeactivate(fixture.componentInstance.users()[0]);
    await flush();

    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'), expect.stringContaining('GENERIC'));
  });

  it('affiche le message d’erreur du serveur au toast si la désactivation échoue avec un message exploitable', async () => {
    const { fixture, confirmationService } = monter({
      getUsers: vi.fn().mockResolvedValue([user()]),
      deactivateUser: vi.fn().mockRejectedValue(new Error('Compte protégé')),
    });
    fixture.detectChanges();
    await flush();
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      opts.accept?.();
      return confirmationService;
    });

    fixture.componentInstance.confirmDeactivate(fixture.componentInstance.users()[0]);
    await flush();

    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'), 'Compte protégé');
  });

  it('affiche le message d’erreur générique du toast si la réactivation échoue sans message serveur', async () => {
    const { fixture, c } = monter({
      getUsers: vi.fn().mockResolvedValue([user({ isActive: false })]),
      reactivateUser: vi.fn().mockRejectedValue(new Error()),
    });
    fixture.detectChanges();
    await flush();

    await c.reactivate(c.users()[0]);

    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('GENERIC'), expect.stringContaining('GENERIC'));
  });
});
