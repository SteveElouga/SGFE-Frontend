import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { DiffusionsListComponent } from './diffusions-list.component';
import { CommunicationService } from '../../../core/communication/communication.service';

// `<app-page-topbar>` embarque la cloche de notifications, dont le service
// (singleton racine) injecte `AuthService`, qui injecte lui-même `Apollo` —
// sans ce mock, un test qui ne mocke pas `AuthService` fait échouer la
// résolution de dépendances avant même d'atteindre le composant testé.
const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };

/** Liste des diffusions envoyées : chargement `cache-and-network` et le
 *  calcul du pourcentage d'envoi affiché par ligne. */
function diffusion(p: Partial<{ diffusionId: string; nbTotal: number; nbEnvoyes: number }> = {}) {
  return {
    diffusionId: 'd-1',
    message: 'Message',
    statut: 'TERMINEE',
    nbTotal: 10,
    nbEnvoyes: 10,
    nbEchecs: 0,
    createdBy: 'admin',
    createdAt: '2026-08-01',
    ...p,
  };
}

function monter(watchDiffusions?: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [DiffusionsListComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map() } } },
      { provide: CommunicationService, useValue: { watchDiffusions: watchDiffusions ?? vi.fn() } },
      { provide: Apollo, useValue: apolloStub },
    ],
  });
  const fixture = TestBed.createComponent(DiffusionsListComponent);
  return { fixture, c: fixture.componentInstance };
}

describe('DiffusionsListComponent', () => {
  it('charge les diffusions au montage', () => {
    const watchDiffusions = vi.fn().mockReturnValue({
      valueChanges: of({ data: { diffusions: [diffusion(), diffusion({ diffusionId: 'd-2' })] }, loading: false }),
    });
    const { fixture, c } = monter(watchDiffusions);
    fixture.detectChanges();

    expect(watchDiffusions).toHaveBeenCalled();
    expect(c.diffusions()).toHaveLength(2);
    expect(c.loading()).toBe(false);
  });

  it('affiche un message d’erreur en cas d’échec', () => {
    const watchDiffusions = vi.fn().mockReturnValue({
      valueChanges: throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'Service indisponible' }])),
    });
    const { fixture, c } = monter(watchDiffusions);
    fixture.detectChanges();

    expect(c.error()).toBe('Service indisponible');
    expect(c.loading()).toBe(false);
  });

  it('lienDiffusion pointe vers la fiche détail exacte', () => {
    const { c } = monter();
    const lien = c as unknown as { lienDiffusion: (d: { diffusionId: string }) => string[] };
    expect(lien.lienDiffusion(diffusion({ diffusionId: 'd-42' }))).toEqual(['/communication', 'd-42']);
  });

  it('calcule le pourcentage envoyé, arrondi', () => {
    const { c } = monter();
    expect(c.pourcentage(diffusion({ nbTotal: 3, nbEnvoyes: 2 }))).toBe(67);
  });

  it('renvoie 0 sans exploser quand le total est nul', () => {
    const { c } = monter();
    expect(c.pourcentage(diffusion({ nbTotal: 0, nbEnvoyes: 0 }))).toBe(0);
  });
});
