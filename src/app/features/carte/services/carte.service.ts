import { Injectable, inject } from '@angular/core';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import type { AbonneLigne } from '../../../graphql/vues';
import type { CompteurGeoPoint, LigneImportCoordonnees, StatutLigneImport } from '../carte.model';

@Injectable({ providedIn: 'root' })
export class CarteService {
  private readonly abonnesService = inject(AbonnesService);

  /**
   * Compteur géolocalisé correspondant à un abonné de la liste, ou `null` si
   * non géolocalisé (comportement normal et attendu — un compteur sans
   * coordonnée n'apparaît simplement pas sur la carte).
   */
  toGeoPoint(abonne: AbonneLigne): CompteurGeoPoint | null {
    const compteur = abonne.compteur;
    if (!compteur) return null;
    const { latitude, longitude } = compteur;
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return null;
    }
    return {
      abonneId: abonne.id,
      numeroCompteur: compteur.numeroCompteur,
      quartier: compteur.quartier,
      statut: abonne.statut,
      latitude,
      longitude,
      dateMajPosition: compteur.dateMajPosition ?? null,
    };
  }

  /**
   * Envoie les lignes prêtes (`A_IMPORTER`) à `importerCoordonneesCompteurs`
   * (ADMIN). Les valeurs restent les chaînes brutes lues dans le CSV — c'est
   * la gateway qui reparse `numeroCompteur` (`Int!` côté `Compteur`, mais
   * `String!` en entrée de cette mutation) pour dégrader gracieusement ligne
   * par ligne plutôt que de rejeter tout l'envoi sur une seule valeur non
   * convertible.
   */
  async importerCoordonnees(lignes: LigneImportCoordonnees[]) {
    const aEnvoyer: readonly LigneImportCoordonnees[] = lignes.filter(
      (l): l is LigneImportCoordonnees & { statut: Extract<StatutLigneImport, 'A_IMPORTER'> } =>
        l.statut === 'A_IMPORTER',
    );
    return this.abonnesService.importerCoordonneesCompteurs(
      aEnvoyer.map((l) => ({
        numeroCompteur: l.numeroCompteurBrut,
        latitude: l.latitudeBrut,
        longitude: l.longitudeBrut,
      })),
    );
  }
}
