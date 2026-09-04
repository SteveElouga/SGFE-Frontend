import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CompteursPanelComponent } from './compteurs-panel.component';
import type { Compteur, HistoriqueCompteurEntry } from '../../../../shared/models/abonne.model';

/**
 * Panneau purement présentationnel (voir le commentaire du composant) : pas
 * d'Apollo à mocker ici, seulement le rendu selon les `input()` et les trois
 * branches mutuellement exclusives (chargement / erreur / contenu).
 */
function compteur(p: Partial<Compteur> = {}): Compteur {
  return {
    id: 'c-1',
    numeroCompteur: 1042,
    quartier: 'Plateau',
    camp: 3,
    indexInitial: 12,
    datePose: '2024-01-10',
    position: 'Devant portail',
    statut: 'ACTIF',
    ...p,
  };
}

function snapshot(p: Partial<Compteur> = {}) {
  const { id: _id, statut: _statut, ...s } = compteur(p);
  return s;
}

function entree(p: Partial<HistoriqueCompteurEntry> = {}): HistoriqueCompteurEntry {
  return {
    id: 'h-1',
    indexFermeture: 458.5,
    dateRemplacement: '2025-06-01',
    createdAt: '2025-06-01',
    ancienCompteur: snapshot({ numeroCompteur: 100 }),
    nouveauCompteur: snapshot({ numeroCompteur: 200 }),
    ...p,
  };
}

describe('CompteursPanelComponent', () => {
  function monter(inputs: Partial<{
    compteurActuel: Compteur | null;
    historique: HistoriqueCompteurEntry[];
    historiqueLoading: boolean;
    historiqueError: string | null;
  }> = {}) {
    TestBed.configureTestingModule({
      imports: [CompteursPanelComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const fixture = TestBed.createComponent(CompteursPanelComponent);
    fixture.componentRef.setInput('compteurActuel', inputs.compteurActuel ?? null);
    fixture.componentRef.setInput('historique', inputs.historique ?? []);
    fixture.componentRef.setInput('historiqueLoading', inputs.historiqueLoading ?? false);
    fixture.componentRef.setInput('historiqueError', inputs.historiqueError ?? null);
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    return { fixture, racine };
  }

  it('affiche le squelette de chargement et rien d’autre', () => {
    const { racine } = monter({ historiqueLoading: true, compteurActuel: compteur() });
    expect(racine.querySelector('.hist-skeleton')).toBeTruthy();
    expect(racine.querySelector('.hist-current')).toBeNull();
  });

  it('affiche le bandeau d’erreur au lieu du contenu, une fois le chargement terminé', () => {
    const { racine } = monter({ historiqueError: 'Le serveur est indisponible', compteurActuel: compteur() });
    expect(racine.querySelector('app-error-banner')).toBeTruthy();
    expect(racine.querySelector('.hist-current')).toBeNull();
    expect(racine.querySelector('.hist-skeleton')).toBeNull();
  });

  it('n’affiche pas le bandeau d’erreur pendant le chargement, même si une erreur précédente traîne', () => {
    const { racine } = monter({ historiqueLoading: true, historiqueError: 'Erreur précédente' });
    expect(racine.querySelector('app-error-banner')).toBeNull();
  });

  it('affiche le compteur actuel avec son numéro formaté et sa localisation', () => {
    const { racine } = monter({ compteurActuel: compteur({ numeroCompteur: 7, quartier: 'Centre', camp: 2 }) });
    const texte = racine.textContent ?? '';
    expect(texte).toContain('C-0007');
    expect(texte).toContain('Centre');
    expect(texte).toContain('Camp 2');
  });

  it('n’affiche pas de bloc "compteur actuel" quand il vaut null', () => {
    const { racine } = monter({ compteurActuel: null });
    expect(racine.querySelector('.hist-current')).toBeNull();
  });

  it('affiche un tiret pour la date de pose absente', () => {
    const { racine } = monter({ compteurActuel: compteur({ datePose: '' }) });
    expect(racine.querySelector('.hist-current__rows')?.textContent).toContain('—');
  });

  it('affiche l’état vide quand l’historique est vide', () => {
    const { racine } = monter({ historique: [] });
    expect(racine.querySelector('.hist-empty')).toBeTruthy();
    expect(racine.querySelector('.hist-timeline')).toBeNull();
  });

  it('affiche autant d’entrées de timeline que fournies, dans l’ordre reçu', () => {
    const { racine } = monter({
      historique: [
        entree({ id: 'h-1', ancienCompteur: snapshot({ numeroCompteur: 1 }), nouveauCompteur: snapshot({ numeroCompteur: 2 }) }),
        entree({ id: 'h-2', ancienCompteur: snapshot({ numeroCompteur: 3 }), nouveauCompteur: snapshot({ numeroCompteur: 4 }) }),
      ],
    });
    const lignes = racine.querySelectorAll('.hist-entry');
    expect(lignes).toHaveLength(2);
    expect(racine.querySelector('.hist-section-count')?.textContent?.trim()).toBe('2');
  });

  it('affiche l’ancien et le nouveau compteur de chaque entrée, dans le bon sens', () => {
    const { racine } = monter({
      historique: [entree({ ancienCompteur: snapshot({ numeroCompteur: 10 }), nouveauCompteur: snapshot({ numeroCompteur: 20 }) })],
    });
    const ancien = racine.querySelector('.hist-meter--old .hist-meter__num')?.textContent;
    const nouveau = racine.querySelector('.hist-meter--new .hist-meter__num')?.textContent;
    expect(ancien).toBe('C-0010');
    expect(nouveau).toBe('C-0020');
  });

  it('affiche l’index de fermeture avec trois décimales', () => {
    const { racine } = monter({ historique: [entree({ indexFermeture: 12 })] });
    expect(racine.querySelector('.hist-entry__idx-val')?.textContent).toContain('12.000');
  });
});
