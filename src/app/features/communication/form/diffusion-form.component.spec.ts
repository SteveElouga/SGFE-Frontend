import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { DiffusionFormComponent } from './diffusion-form.component';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { CommunicationService } from '../../../core/communication/communication.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AbonneLigne } from '../../../graphql/vues';

const apolloStub = { subscribe: () => of({}), query: vi.fn(), mutate: vi.fn() };

/**
 * Formulaire de diffusion : ciblage d'abonnés par filtres + sélection
 * manuelle indépendante, puis lancement de la diffusion. Ces tests portent
 * sur ce qui distingue ce formulaire d'une simple liste filtrée : la
 * sélection résiste à un changement de filtre, le camp ne se propose qu'une
 * fois un quartier choisi, et l'envoi est bloqué tant qu'il manque un message
 * ou un destinataire.
 */
function abonne(p: Partial<AbonneLigne> = {}): AbonneLigne {
  return {
    id: 'a-1',
    numeroAbonne: 'AB-0001',
    nom: 'Dupont',
    prenom: 'Jean',
    statut: 'ACTIF',
    compteur: { id: 'c-1', numeroCompteur: 1, quartier: 'Bonamoussadi', camp: 1 },
    ...p,
  } as AbonneLigne;
}

function monter(over: {
  watchAbonnes?: ReturnType<typeof vi.fn>;
  creerDiffusion?: ReturnType<typeof vi.fn>;
} = {}) {
  const watchAbonnes = over.watchAbonnes ?? vi.fn().mockReturnValue({
    valueChanges: of({ data: { abonnes: [] }, loading: false }),
  });
  const creerDiffusion = over.creerDiffusion ?? vi.fn().mockResolvedValue({ diffusionId: 'd-1', nbTotal: 1 });
  const navigate = vi.fn();

  TestBed.configureTestingModule({
    imports: [DiffusionFormComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate, createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      { provide: AbonnesService, useValue: { watchAbonnes } },
      { provide: CommunicationService, useValue: { creerDiffusion } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Apollo, useValue: apolloStub },
    ],
  });
  const fixture = TestBed.createComponent(DiffusionFormComponent);
  return { fixture, c: fixture.componentInstance, creerDiffusion, navigate };
}

describe('DiffusionFormComponent — ciblage', () => {
  const abonnes = [
    abonne({ id: 'a-1', statut: 'ACTIF', compteur: { id: 'c1', numeroCompteur: 1, quartier: 'Bonamoussadi', camp: 1 } as never }),
    abonne({ id: 'a-2', statut: 'SUSPENDU', compteur: { id: 'c2', numeroCompteur: 2, quartier: 'Bonamoussadi', camp: 2 } as never }),
    abonne({ id: 'a-3', statut: 'ACTIF', compteur: { id: 'c3', numeroCompteur: 3, quartier: 'Makepe', camp: 1 } as never }),
  ];

  function creer() {
    return monter({
      watchAbonnes: vi.fn().mockReturnValue({ valueChanges: of({ data: { abonnes }, loading: false }) }),
    });
  }

  it('charge les abonnés au montage', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    expect(c.abonnes()).toHaveLength(3);
  });

  it('filtre par statut', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    c.onFiltersChange({ statut: 'ACTIF', quartier: null, camp: null });
    expect(c.filteredAbonnes().map((a) => a.id)).toEqual(['a-1', 'a-3']);
  });

  it('filtre par quartier', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    c.onFiltersChange({ statut: null, quartier: 'Makepe', camp: null });
    expect(c.filteredAbonnes().map((a) => a.id)).toEqual(['a-3']);
  });

  it('le filtre camp n’apparaît qu’après le choix d’un quartier', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    expect(c.filtersConfig().some((f) => f.key === 'camp')).toBe(false);

    c.onFiltersChange({ statut: null, quartier: 'Bonamoussadi', camp: null });
    expect(c.filtersConfig().some((f) => f.key === 'camp')).toBe(true);
  });

  it('changer de quartier réinitialise le camp choisi (un camp n’a de sens que sous son quartier)', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    // Premier appel : choix du quartier (le camp n'est pas encore proposé).
    c.onFiltersChange({ statut: null, quartier: 'Bonamoussadi', camp: null });
    // Second appel, même quartier : c'est bien le camp qui vient de changer.
    c.onFiltersChange({ statut: null, quartier: 'Bonamoussadi', camp: '2' });
    expect(c.campFilter()).toBe(2);

    // Nouveau quartier : le camp choisi ne s'applique plus.
    c.onFiltersChange({ statut: null, quartier: 'Makepe', camp: null });
    expect(c.campFilter()).toBeNull();
  });

  it('la sélection manuelle survit à un changement de filtre', () => {
    const { fixture, c } = creer();
    fixture.detectChanges();
    c.selectedIds.set(new Set(['a-2'])); // sélectionné alors qu'il est SUSPENDU
    c.onFiltersChange({ statut: 'ACTIF', quartier: null, camp: null });
    expect(c.selectedIds().has('a-2')).toBe(true);
    expect(c.nbSelectionnes()).toBe(1);
  });
});

describe('DiffusionFormComponent — envoi', () => {
  it('refuse d’envoyer sans message', async () => {
    const { c, creerDiffusion } = monter();
    c.selectedIds.set(new Set(['a-1']));
    expect(c.peutEnvoyer()).toBe(false);
    await c.envoyer();
    expect(creerDiffusion).not.toHaveBeenCalled();
  });

  it('refuse d’envoyer sans destinataire sélectionné', async () => {
    const { c, creerDiffusion } = monter();
    c.message.set('Bonjour');
    expect(c.peutEnvoyer()).toBe(false);
    await c.envoyer();
    expect(creerDiffusion).not.toHaveBeenCalled();
  });

  it('envoie le message débarrassé de ses espaces et la sélection exacte', async () => {
    const { c, creerDiffusion } = monter();
    c.message.set('  Coupure demain  ');
    c.selectedIds.set(new Set(['a-1', 'a-2']));
    await c.envoyer();
    expect(creerDiffusion).toHaveBeenCalledWith('Coupure demain', expect.arrayContaining(['a-1', 'a-2']));
  });

  it('navigue vers le détail de la diffusion créée', async () => {
    const { c, navigate } = monter({
      creerDiffusion: vi.fn().mockResolvedValue({ diffusionId: 'd-99', nbTotal: 5 }),
    });
    c.message.set('Bonjour');
    c.selectedIds.set(new Set(['a-1']));
    await c.envoyer();
    expect(navigate).toHaveBeenCalledWith(['/communication', 'd-99']);
  });

  it('affiche l’erreur serveur et ne navigue pas en cas d’échec', async () => {
    const { c, navigate } = monter({
      creerDiffusion: vi.fn().mockRejectedValue(
        new CombinedGraphQLErrors({ data: null }, [{ message: 'Aucun destinataire valide' }]),
      ),
    });
    c.message.set('Bonjour');
    c.selectedIds.set(new Set(['a-1']));
    await c.envoyer();
    expect(c.error()).toBe('Aucun destinataire valide');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('remonte `submitting` à faux après l’envoi, succès ou échec', async () => {
    const { c } = monter({ creerDiffusion: vi.fn().mockRejectedValue(new Error('panne')) });
    c.message.set('Bonjour');
    c.selectedIds.set(new Set(['a-1']));
    await c.envoyer();
    expect(c.submitting()).toBe(false);
  });
});

describe('DiffusionFormComponent — erreur de chargement', () => {
  it('affiche un message si le chargement des abonnés échoue', () => {
    const { fixture, c } = monter({
      watchAbonnes: vi.fn().mockReturnValue({
        valueChanges: throwError(() => new CombinedGraphQLErrors({ data: null }, [{ message: 'Service indisponible' }])),
      }),
    });
    fixture.detectChanges();
    expect(c.error()).toBe('Service indisponible');
    expect(c.loading()).toBe(false);
  });
});
