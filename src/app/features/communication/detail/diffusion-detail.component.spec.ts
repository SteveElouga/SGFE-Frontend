import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError, Subject } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { DiffusionDetailComponent } from './diffusion-detail.component';
import { CommunicationService } from '../../../core/communication/communication.service';

/**
 * Détail d'une diffusion : chargement initial via `getDiffusion`, puis
 * progression en direct via la subscription `diffusionProgressionUpdated`, qui
 * échoue en silence si le temps réel est indisponible (l'écran garde la
 * dernière valeur chargée). Ces tests portent sur les deux, et sur le calcul
 * du pourcentage — qui ne doit jamais planter sur un total nul.
 */
function diffusion(p: Partial<{ diffusionId: string; message: string; nbTotal: number; nbEnvoyes: number; nbEchecs: number }> = {}) {
  return {
    diffusionId: 'd-1',
    message: 'Coupure prévue demain',
    statut: 'EN_COURS',
    nbTotal: 10,
    nbEnvoyes: 4,
    nbEchecs: 1,
    createdBy: 'admin',
    createdAt: '2026-08-01T10:00:00Z',
    ...p,
  };
}

function monter(over: {
  getDiffusion?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
  const getDiffusion = over.getDiffusion ?? vi.fn().mockResolvedValue(diffusion());
  const subscribe = over.subscribe ?? vi.fn().mockReturnValue(of({ data: {} }));

  TestBed.configureTestingModule({
    imports: [DiffusionDetailComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'd-1']]) } } },
      { provide: CommunicationService, useValue: { getDiffusion } },
      { provide: Apollo, useValue: { subscribe } },
    ],
  });
  const fixture = TestBed.createComponent(DiffusionDetailComponent);
  return { fixture, c: fixture.componentInstance, getDiffusion, subscribe };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('DiffusionDetailComponent — chargement', () => {
  it('charge la diffusion demandée par son id de route', async () => {
    const { fixture, c, getDiffusion } = monter();
    fixture.detectChanges();
    await flush();

    expect(getDiffusion).toHaveBeenCalledWith('d-1');
    expect(c.diffusion()?.message).toBe('Coupure prévue demain');
    expect(c.loading()).toBe(false);
  });

  it('affiche une erreur explicite quand la diffusion n’existe pas', async () => {
    const { fixture, c } = monter({ getDiffusion: vi.fn().mockResolvedValue(null) });
    fixture.detectChanges();
    await flush();

    expect(c.diffusion()).toBeNull();
    expect(c.error()).toBeTruthy();
  });

  it('affiche le message serveur en cas d’échec réseau', async () => {
    const { fixture, c } = monter({
      getDiffusion: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'Diffusion introuvable' }]),
      ),
    });
    fixture.detectChanges();
    await flush();

    expect(c.error()).toBe('Diffusion introuvable');
  });
});

describe('DiffusionDetailComponent — pourcentage', () => {
  it('calcule le pourcentage envoyé, arrondi', async () => {
    const { fixture, c } = monter({ getDiffusion: vi.fn().mockResolvedValue(diffusion({ nbTotal: 3, nbEnvoyes: 1 })) });
    fixture.detectChanges();
    await flush();
    expect(c.pourcentage()).toBe(33);
  });

  it('renvoie 0 sans exploser sur un total de zéro destinataire', async () => {
    const { fixture, c } = monter({ getDiffusion: vi.fn().mockResolvedValue(diffusion({ nbTotal: 0, nbEnvoyes: 0 })) });
    fixture.detectChanges();
    await flush();
    expect(c.pourcentage()).toBe(0);
  });

  it('renvoie 0 tant que rien n’est chargé', () => {
    const { c } = monter();
    expect(c.pourcentage()).toBe(0);
  });
});

describe('DiffusionDetailComponent — progression en direct', () => {
  it('met à jour la diffusion à chaque événement reçu', async () => {
    const evenements = new Subject<{ data: { diffusionProgressionUpdated: ReturnType<typeof diffusion> | null } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();
    expect(c.diffusion()?.nbEnvoyes).toBe(4);

    evenements.next({ data: { diffusionProgressionUpdated: diffusion({ nbEnvoyes: 9 }) } });
    expect(c.diffusion()?.nbEnvoyes).toBe(9);
  });

  it('ignore un événement sans charge utile', async () => {
    const evenements = new Subject<{ data: { diffusionProgressionUpdated: ReturnType<typeof diffusion> | null } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { diffusionProgressionUpdated: null } });
    expect(c.diffusion()?.nbEnvoyes).toBe(4); // inchangé
  });

  it('conserve la dernière valeur chargée si le temps réel échoue', async () => {
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(throwError(() => new Error('WS down'))) });
    fixture.detectChanges();
    await flush();

    expect(c.diffusion()?.message).toBe('Coupure prévue demain');
    expect(c.error()).toBeNull();
  });
});
