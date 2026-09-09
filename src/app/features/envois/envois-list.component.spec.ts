import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { EnvoisListComponent } from './envois-list.component';
import { FacturesService } from '../../core/factures/factures.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { ToastService } from '../../shared/services/toast.service';
import type { Envoi } from '../../shared/models/facture.model';

const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };
// `<app-page-topbar>` embarque la cloche de notifications (NotificationBellComponent),
// qui lit `notifications()`/`unreadCount()` sur le service — sans ce stub complet,
// tout écran utilisant la topbar échoue avant même d'atteindre le composant testé.
const notificationsStub = { refresh: vi.fn().mockResolvedValue(undefined), unreadCount: signal(0), notifications: signal([]) };

/**
 * Journal global des envois WhatsApp. Ces tests portent sur ce qui distingue
 * cet écran d'une simple liste : le journal doit rester consultable même si
 * l'enrichissement par facture échoue, le renvoi rafraîchit aussi les
 * notifications (l'alerte d'échec n'a plus lieu d'être), et les compteurs de
 * filtre reflètent l'ensemble — pas la seule page affichée.
 */
function envoi(p: Partial<Envoi> = {}): Envoi {
  return {
    envoiId: 'e-1',
    factureId: 'f-1',
    abonneId: 'ab-1',
    statut: 'ENVOYE',
    dateEnvoi: '2026-08-01T10:00:00Z',
    typeEnvoi: 'FACTURE',
    erreur: '',
    ...p,
  } as Envoi;
}

function facture(p: Partial<{ factureId: string; abonneId: string; abonneNom: string; abonneNumero: string; numeroFacture: string }> = {}) {
  return { factureId: 'f-1', abonneId: 'ab-1', abonneNom: 'Jean Dupont', abonneNumero: 'AB-0001', numeroFacture: 'FACT-1', ...p };
}

function monter(over: {
  getAllEnvois?: ReturnType<typeof vi.fn>;
  getFactures?: ReturnType<typeof vi.fn>;
  renvoyerEnvoi?: ReturnType<typeof vi.fn>;
} = {}) {
  const getAllEnvois = over.getAllEnvois ?? vi.fn().mockResolvedValue([]);
  const getFactures = over.getFactures ?? vi.fn().mockResolvedValue([]);
  const renvoyerEnvoi = over.renvoyerEnvoi ?? vi.fn().mockResolvedValue({});
  const refresh = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [EnvoisListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: FacturesService, useValue: { getAllEnvois, getFactures, renvoyerEnvoi } },
      { provide: NotificationsService, useValue: { ...notificationsStub, refresh } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Apollo, useValue: apolloStub },
    ],
  });
  const fixture = TestBed.createComponent(EnvoisListComponent);
  return { fixture, c: fixture.componentInstance, getAllEnvois, getFactures, renvoyerEnvoi, refresh };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('EnvoisListComponent — chargement et enrichissement', () => {
  it('enrichit chaque envoi avec le nom d’abonné et le numéro de facture', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi()]),
      getFactures: vi.fn().mockResolvedValue([facture()]),
    });
    fixture.detectChanges();
    await flush();

    expect(c.rows()[0].destinataire).toBe('Jean Dupont');
    expect(c.rows()[0].numeroFacture).toBe('FACT-1');
  });

  it('reste consultable si l’enrichissement par facture échoue', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi()]),
      getFactures: vi.fn().mockRejectedValue(new Error('Facturation indisponible')),
    });
    fixture.detectChanges();
    await flush();

    expect(c.error()).toBeNull();
    expect(c.rows()).toHaveLength(1);
    expect(c.rows()[0].destinataire).toContain('ENVOIS.DESTINATAIRE_INCONNU');
  });

  it('affiche une erreur si le chargement des envois eux-mêmes échoue', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'Service indisponible' }]),
      ),
    });
    fixture.detectChanges();
    await flush();

    expect(c.error()).toBe('Service indisponible');
  });

  it('trie les envois du plus récent au plus ancien', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'ancien', dateEnvoi: '2026-01-01T00:00:00Z' }),
        envoi({ envoiId: 'recent', dateEnvoi: '2026-08-01T00:00:00Z' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    expect(c.envois().map((e) => e.envoiId)).toEqual(['recent', 'ancien']);
  });
});

describe('EnvoisListComponent — filtres et compteurs', () => {
  it('les compteurs de filtre portent sur l’ensemble des envois, pas la page affichée', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e1', statut: 'ECHEC' }),
        envoi({ envoiId: 'e2', statut: 'ECHEC' }),
        envoi({ envoiId: 'e3', statut: 'ENVOYE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();

    const filtre = c.filtersConfig()[0];
    expect(filtre.options.find((o) => o.value === 'ECHEC')?.count).toBe(2);
    expect(c.nbEchecs()).toBe(2);
  });

  it('onFiltersChange filtre la liste par statut', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e1', statut: 'ECHEC' }),
        envoi({ envoiId: 'e2', statut: 'ENVOYE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();

    c.onFiltersChange({ statut: 'ECHEC' });
    expect(c.rows().map((r) => r.envoiId)).toEqual(['e1']);
  });

  it('l’absence de filtre revient à « TOUS »', async () => {
    const { fixture, c } = monter({ getAllEnvois: vi.fn().mockResolvedValue([envoi()]) });
    fixture.detectChanges();
    await flush();
    c.onFiltersChange({ statut: 'ECHEC' });
    c.onFiltersChange({ statut: null });
    expect(c.filtre()).toBe('TOUS');
  });
});

describe('EnvoisListComponent — renvoi', () => {
  it('renvoie l’envoi, notifie et rafraîchit le compteur de notifications', async () => {
    const { fixture, c, renvoyerEnvoi, refresh, getAllEnvois } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi({ envoiId: 'e-9', statut: 'ECHEC' })]),
    });
    fixture.detectChanges();
    await flush();
    getAllEnvois.mockClear();

    await c.renvoyer(envoi({ envoiId: 'e-9' }));

    expect(renvoyerEnvoi).toHaveBeenCalledWith('e-9');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getAllEnvois).toHaveBeenCalledTimes(1); // recharge le journal
    expect(c.resending()).toBeNull();
  });

  it('n’autorise qu’un renvoi à la fois', async () => {
    let resolve!: () => void;
    const enVol = new Promise<Envoi>((r) => (resolve = () => r(envoi())));
    const renvoyerEnvoi = vi.fn().mockReturnValue(enVol);
    const { fixture, c } = monter({ renvoyerEnvoi });
    fixture.detectChanges();
    await flush();

    const p1 = c.renvoyer(envoi({ envoiId: 'e-1' }));
    const p2 = c.renvoyer(envoi({ envoiId: 'e-2' })); // doit être un no-op
    resolve();
    await Promise.all([p1, p2]);

    expect(renvoyerEnvoi).toHaveBeenCalledTimes(1);
    expect(renvoyerEnvoi).toHaveBeenCalledWith('e-1');
  });

  it('affiche l’erreur serveur si le renvoi échoue', async () => {
    const { fixture, c } = monter({
      renvoyerEnvoi: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'Numéro injoignable' }]),
      ),
    });
    fixture.detectChanges();
    await flush();
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    await c.renvoyer(envoi());
    expect(toast.error).toHaveBeenCalledWith('Numéro injoignable');
    expect(c.resending()).toBeNull();
  });
});

describe('EnvoisListComponent — présentation', () => {
  function creer() {
    const { c } = monter();
    return c;
  }

  it('statutTone associe la bonne teinte à chaque statut', () => {
    const c = creer();
    expect(c.statutTone('ENVOYE')).toBe('success');
    expect(c.statutTone('ECHEC')).toBe('danger');
    expect(c.statutTone('EN_ATTENTE')).toBe('warning');
  });

  it('typeLabel retombe sur FACTURE par défaut', () => {
    const c = creer();
    expect(c.typeLabel(undefined)).toContain('FACTURE');
  });

  it('formatHeure et formatDate renvoient un tiret pour une date vide', () => {
    const c = creer();
    expect(c.formatHeure('')).toBe('—');
    expect(c.formatDate('')).toBe('—');
  });

  it('formatDate rend une date réelle au format local', () => {
    const c = creer();
    expect(c.formatDate('2026-08-01T10:00:00Z')).not.toBe('—');
    expect(c.formatDate('2026-08-01T10:00:00Z')).not.toBe('2026-08-01T10:00:00Z');
  });
});

/**
 * Rendu réel du template : les tests ci-dessus exercent `rows()`/`groupes()`
 * via les signaux, mais aucun ne rappelle `detectChanges()` après la
 * résolution du chargement — le `@else` (liste groupée par jour, pagination,
 * bouton de renvoi) ne s'affichait donc jamais réellement.
 */
describe('EnvoisListComponent — rendu du template', () => {
  function envois(n: number, statut: Envoi['statut'] = 'ENVOYE') {
    return Array.from({ length: n }, (_, i) =>
      envoi({ envoiId: `e-${i}`, statut, dateEnvoi: `2026-08-${String((i % 27) + 1).padStart(2, '0')}T10:00:00Z` }),
    );
  }

  it('affiche le squelette de chargement avant résolution', () => {
    const { fixture } = monter();
    fixture.detectChanges(); // avant flush() : loading() encore vrai
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelectorAll('.envoi--skel').length).toBeGreaterThan(0);
  });

  it('affiche l’état vide quand la liste filtrée est vide', async () => {
    const { fixture } = monter({ getAllEnvois: vi.fn().mockResolvedValue([]) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.envois__empty')).toBeTruthy();
  });

  it('groupe les envois par jour et rend chaque ligne avec ses métadonnées', async () => {
    const { fixture } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e-1', dateEnvoi: '2026-08-01T09:00:00Z', statut: 'ECHEC', erreur: 'Numéro invalide' }),
        envoi({ envoiId: 'e-2', dateEnvoi: '2026-08-01T11:00:00Z', factureId: 'f-1', statut: 'ENVOYE' }),
      ]),
      getFactures: vi.fn().mockResolvedValue([facture({ factureId: 'f-1' })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelectorAll('.envois__jour')).toHaveLength(1);
    expect(racine.querySelectorAll('.envoi')).toHaveLength(2);
    expect(racine.querySelector('.envoi--echec')).toBeTruthy();
    expect(racine.querySelector('.envoi__err')?.textContent).toContain('Numéro invalide');
    // Chaque ligne rattachée à la même facture porte sa référence abonné ET son numéro de facture.
    expect(racine.querySelectorAll('.envoi__ref')).toHaveLength(4);
    // Bandeau des échecs, affiché dès qu'il y en a un.
    expect(racine.querySelector('.envois__echecs')).toBeTruthy();
  });

  it('masque le bandeau d’échecs et les références absentes quand rien ne correspond', async () => {
    const { fixture } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi({ envoiId: 'e-1', statut: 'ENVOYE', abonneId: undefined, factureId: undefined })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.envois__echecs')).toBeNull();
    expect(racine.querySelectorAll('.envoi__ref')).toHaveLength(0);
  });

  it('clique sur le bouton de renvoi d’une ligne : appelle le service avec cet envoi précis', async () => {
    const { fixture, renvoyerEnvoi } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e-1', statut: 'ECHEC' }),
        envoi({ envoiId: 'e-2', statut: 'ENVOYE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const boutons = [...racine.querySelectorAll<HTMLButtonElement>('.envoi__resend')];
    expect(boutons).toHaveLength(2);
    boutons[1].click();
    await flush();

    expect(renvoyerEnvoi).toHaveBeenCalledWith('e-2');
  });

  it('affiche le spinner de renvoi pendant l’envoi en cours, puis le referme', async () => {
    let resolve!: () => void;
    const enVol = new Promise<Envoi>((r) => (resolve = () => r(envoi())));
    const { fixture } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi({ envoiId: 'e-1', statut: 'ECHEC' })]),
      renvoyerEnvoi: vi.fn().mockReturnValue(enVol),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    (racine.querySelector('.envoi__resend') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(racine.querySelector('.envoi__resend i.pi-spin')).toBeTruthy();

    resolve();
    await flush();
    fixture.detectChanges();
    expect(racine.querySelector('.envoi__resend i.pi-spin')).toBeNull();
  });

  it('bascule le filtre par statut via le panneau et met à jour la liste rendue', async () => {
    const { fixture, c } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e-1', statut: 'ECHEC' }),
        envoi({ envoiId: 'e-2', statut: 'ENVOYE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    c.onFiltersChange({ statut: 'ECHEC' });
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelectorAll('.envoi')).toHaveLength(1);
    expect(racine.querySelector('.envoi--echec')).toBeTruthy();
  });

  it('affiche la pagination et navigue à la page suivante au clic', async () => {
    const { fixture, c } = monter({ getAllEnvois: vi.fn().mockResolvedValue(envois(35)) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    expect(c.pageCount()).toBe(2);
    const suivant = racine.querySelector('[aria-label="COMMON.NEXT_PAGE"]') as HTMLButtonElement;
    expect(suivant).toBeTruthy();
    expect(suivant.disabled).toBe(false);
    suivant.click();
    fixture.detectChanges();
    expect(c.safePage()).toBe(1);

    const precedent = racine.querySelector('[aria-label="COMMON.PREV_PAGE"]') as HTMLButtonElement;
    expect(precedent.disabled).toBe(false);
    // La page suivante devient indisponible une fois sur la dernière.
    expect(suivant.disabled).toBe(true);

    precedent.click();
    fixture.detectChanges();
    expect(c.safePage()).toBe(0);
  });

  it('fenêtre la liste des numéros de page au-delà de cinq pages', async () => {
    const { fixture, c } = monter({ getAllEnvois: vi.fn().mockResolvedValue(envois(200)) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(c.pageCount()).toBeGreaterThan(5);
    c.goPage(4);
    fixture.detectChanges();
    // Fenêtre glissante : au-delà de la page 2, la page 0 ne doit plus apparaître.
    const racine = fixture.nativeElement as HTMLElement;
    const numeros = [...racine.querySelectorAll('.envois__page-btn')]
      .map((b) => b.textContent?.trim())
      .filter((t) => t && /^\d+$/.test(t));
    expect(numeros).not.toContain('1');
  });

  it('clique sur un bouton de numéro de page précis', async () => {
    const { fixture, c } = monter({ getAllEnvois: vi.fn().mockResolvedValue(envois(65)) });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const pages = [...racine.querySelectorAll<HTMLButtonElement>('.envois__page-btn')];
    // pages[0] = précédent, dernier = suivant ; les numéros sont entre les deux.
    const numeroPage2 = pages.find((b) => b.textContent?.trim() === '2');
    numeroPage2?.click();
    fixture.detectChanges();
    expect(c.safePage()).toBe(1);
  });

  it('affiche une erreur rendue avec bouton « réessayer » qui relance le chargement', async () => {
    const getAllEnvois = vi.fn()
      .mockRejectedValueOnce(new CombinedGraphQLErrors({ data: null }, [{ message: 'Indisponible' }]))
      .mockResolvedValue([]);
    const { fixture } = monter({ getAllEnvois });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const banniere = racine.querySelector('.error-banner__message');
    expect(banniere?.textContent).toContain('Indisponible');

    (racine.querySelector('.error-banner__retry') as HTMLButtonElement).click();
    await flush();
    expect(getAllEnvois).toHaveBeenCalledTimes(2);
  });

  it('typeLabel personnalisé s’affiche sur la ligne rendue', async () => {
    const { fixture } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([envoi({ envoiId: 'e-1', typeEnvoi: 'SUSPENSION' })]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    // Sans traduction chargée en test, `typeLabel` retombe sur la valeur brute.
    expect(racine.querySelector('.envoi__type')?.textContent).toContain('SUSPENSION');
  });

  it('clique sur une puce de filtre par statut dans le panneau : filtre réellement la liste rendue', async () => {
    const { fixture } = monter({
      getAllEnvois: vi.fn().mockResolvedValue([
        envoi({ envoiId: 'e-1', statut: 'ECHEC' }),
        envoi({ envoiId: 'e-2', statut: 'ENVOYE' }),
      ]),
    });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    const puces = [...racine.querySelectorAll<HTMLButtonElement>('.fp__chip')];
    const puceEchec = puces.find((b) => b.textContent?.includes('ENVOIS.STATUT.ECHEC'));
    expect(puceEchec).toBeTruthy();
    puceEchec!.click();
    fixture.detectChanges();

    expect(racine.querySelectorAll('.envoi')).toHaveLength(1);
    expect(racine.querySelector('.envoi--echec')).toBeTruthy();
  });
});
