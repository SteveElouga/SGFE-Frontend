import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NomAbonnePipe } from '../../../../shared/pipes/nom-abonne.pipe';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AbonnesService, RemplacerCompteurInput } from '../../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../../core/auth/auth.service';
import { Abonne, Compteur } from '../../../../shared/models/abonne.model';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { CompteurPipe } from '../../../../shared/pipes/compteur.pipe';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * Bottom-sheet de remplacement du compteur d'un abonné (écran 19). Auto-contenu :
 * détient son formulaire, charge le dernier index (index de fermeture de l'ancien
 * compteur) à l'ouverture, et émet `(saved)` avec le nouveau compteur. Le parent
 * pilote la visibilité (`[open]`) et applique le résultat.
 */
@Component({
  selector: 'app-remplacer-compteur-sheet',
  imports: [NomAbonnePipe, FormsModule, DatePipe, InputTextModule, TranslatePipe, BottomSheetComponent, CompteurPipe],
  templateUrl: './remplacer-compteur-sheet.component.html',
  styleUrl: './remplacer-compteur-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemplacerCompteurSheetComponent {
  readonly open = input(false);
  readonly abonne = input<Abonne | null>(null);
  readonly close = output<void>();
  readonly saved = output<Compteur>();

  private readonly abonnesService = inject(AbonnesService);
  private readonly campagnesService = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly newNumeroCompteur = signal('');
  readonly newQuartier = signal('');
  readonly newCamp = signal('');
  readonly newIndexInitial = signal('0');
  readonly newDatePose = signal('');
  readonly loading = signal(false);
  readonly dernierIndex = signal<number | null>(null);
  readonly dernierIndexLoading = signal(false);

  readonly dernierIndexDisplay = computed(() => {
    const idx = this.dernierIndex();
    if (idx === null) return '—';
    return `${idx.toLocaleString('fr-FR')} m³`;
  });

  constructor() {
    // Réinitialise le formulaire et charge le dernier index à chaque ouverture.
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) this.init();
      wasOpen = isOpen;
    });
  }

  private init(): void {
    const c = this.abonne()?.compteur;
    this.newNumeroCompteur.set('');
    this.newQuartier.set(c?.quartier ?? '');
    this.newCamp.set(c?.camp ? String(c.camp) : '');
    this.newIndexInitial.set('0');
    this.newDatePose.set(new Date().toISOString().slice(0, 10));
    this.dernierIndex.set(null);
    void this.loadDernierIndex();
  }

  private async loadDernierIndex(): Promise<void> {
    const id = this.abonne()?.id;
    if (!id) return;
    this.dernierIndexLoading.set(true);
    try {
      const result = await this.campagnesService.getDernierIndex(id);
      this.dernierIndex.set(result.dernierIndex);
    } catch {
      // Afficher '—' en cas d'erreur — non bloquant
    } finally {
      this.dernierIndexLoading.set(false);
    }
  }

  async save(): Promise<void> {
    const abonne = this.abonne();
    if (!abonne) return;
    const n = Number.parseInt(this.newNumeroCompteur(), 10);
    const camp = Number.parseInt(this.newCamp(), 10);
    const indexInitial = Number.parseFloat(this.newIndexInitial());
    // Attendre le dernier index (index de fermeture) pour ne pas envoyer 0 par erreur.
    if (!n || !camp || this.dernierIndexLoading()) return;

    this.loading.set(true);
    const input: RemplacerCompteurInput = {
      numeroCompteur: n,
      quartier: this.newQuartier(),
      camp,
      indexInitial: Number.isNaN(indexInitial) ? 0 : indexInitial,
      datePose: this.newDatePose(),
      // Index de fermeture de l'ancien compteur (« Dernier index conservé »).
      indexFermeture: this.dernierIndex() ?? 0,
    };
    try {
      const newCompteur = await this.abonnesService.remplacerCompteur(abonne.id, input);
      this.saved.emit(newCompteur);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.loading.set(false);
    }
  }
}
