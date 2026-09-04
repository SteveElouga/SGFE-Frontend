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
});
