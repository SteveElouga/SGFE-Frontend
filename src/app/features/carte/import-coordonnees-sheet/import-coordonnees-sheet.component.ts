import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { CarteService } from '../services/carte.service';
import { parserCsvCoordonnees } from '../services/import-csv.util';
import type { LigneImportCoordonnees } from '../carte.model';

/**
 * Feuille modale d'import CSV des coordonnées de compteurs (ADMIN). Dépose un
 * fichier `numero_compteur,latitude,longitude` → aperçu ligne par ligne AVANT
 * tout envoi (statut détecté côté client) → « Importer », qui appelle
 * `importerCoordonneesCompteurs` (via `CarteService.importerCoordonnees`) et
 * affiche le résultat exact renvoyé par le serveur (`nbImportees`/`erreurs`).
 */
@Component({
  selector: 'app-import-coordonnees-sheet',
  imports: [BottomSheetComponent, ErrorBannerComponent, TranslatePipe],
  templateUrl: './import-coordonnees-sheet.component.html',
  styleUrl: './import-coordonnees-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportCoordonneesSheetComponent {
  private readonly carteService = inject(CarteService);
  private readonly translate = inject(TranslateService);

  readonly open = input(false);
  readonly close = output<void>();
  /**
   * Émis après un import serveur réussi (nb réellement importées). Le
   * rafraîchissement de la liste elle-même est déjà assuré par
   * `AbonnesService.importerCoordonneesCompteurs` (`refetchQueries` sur
   * `GET_ABONNES`) — cet évènement sert au parent pour la rétroaction
   * (ex. toast), pas pour recharger les données.
   */
  readonly importReussi = output<number>();

  readonly nomFichier = signal<string | null>(null);
  readonly lignes = signal<LigneImportCoordonnees[]>([]);
  readonly glisseSurvol = signal(false);
  readonly envoiEnCours = signal(false);
  readonly erreurEnvoi = signal<string | null>(null);
  readonly resultatServeur = signal<{ nbImportees: number; erreurs: { numeroCompteur: string; message: string }[] } | null>(null);

  readonly lignesValides = computed(() => this.lignes().filter((l) => l.statut === 'A_IMPORTER'));
  readonly lignesInvalides = computed(() => this.lignes().filter((l) => l.statut === 'FORMAT_INVALIDE'));
  readonly peutImporter = computed(
    () => this.lignesValides().length > 0 && !this.envoiEnCours(),
  );

  constructor() {
    // Réinitialise l'état à chaque ouverture — un fichier laissé de la
    // session précédente ne doit pas survivre à la fermeture.
    let etaitOuverte = false;
    effect(() => {
      const ouverte = this.open();
      if (ouverte && !etaitOuverte) this.reinitialiser();
      etaitOuverte = ouverte;
    });
  }

  private reinitialiser(): void {
    this.nomFichier.set(null);
    this.lignes.set([]);
    this.erreurEnvoi.set(null);
    this.resultatServeur.set(null);
    this.envoiEnCours.set(false);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.glisseSurvol.set(true);
  }

  onDragLeave(): void {
    this.glisseSurvol.set(false);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.glisseSurvol.set(false);
    const fichier = ev.dataTransfer?.files?.[0];
    if (fichier) void this.lireFichier(fichier);
  }

  onFileInput(ev: Event): void {
    const fichier = (ev.target as HTMLInputElement).files?.[0];
    if (fichier) void this.lireFichier(fichier);
  }

  private async lireFichier(fichier: File): Promise<void> {
    this.erreurEnvoi.set(null);
    this.resultatServeur.set(null);
    this.nomFichier.set(fichier.name);
    const contenu = await fichier.text();
    this.lignes.set(parserCsvCoordonnees(contenu));
  }

  async importer(): Promise<void> {
    const lignes = this.lignesValides();
    if (lignes.length === 0) return;
    this.envoiEnCours.set(true);
    this.erreurEnvoi.set(null);
    this.resultatServeur.set(null);
    try {
      const resultat = await this.carteService.importerCoordonnees(lignes);
      this.resultatServeur.set(resultat);
      this.importReussi.emit(resultat.nbImportees);
    } catch (err: unknown) {
      this.erreurEnvoi.set(
        err instanceof Error ? err.message : this.translate.instant('ERRORS.GENERIC'),
      );
    } finally {
      this.envoiEnCours.set(false);
    }
  }
}
