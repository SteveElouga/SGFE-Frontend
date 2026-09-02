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
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';
import { ToastService } from '../../../shared/services/toast.service';
import { nomAbonne } from '../../../shared/utils/abonne.utils';
import type { ReleveLigne } from '../../../graphql/vues';
import type { CorrigerReleveMutation } from '../../../graphql/generated';

/**
 * Bottom-sheet de correction d'un index déjà relevé. Le RPC/la mutation
 * existaient déjà côté backend et gateway (`corriger_releve` / `corrigerReleve`)
 * sans aucun point d'entrée dans l'interface — c'est ce composant qui comble
 * ce manque. Sans lui, la seule façon de réparer un mauvais index était
 * d'annuler la facture puis de la régénérer, ce qui relit le relevé encore
 * faux et reproduit fidèlement l'erreur.
 */
@Component({
  selector: 'app-corriger-releve-sheet',
  imports: [DecimalPipe, FormsModule, InputTextModule, TranslatePipe, BottomSheetComponent],
  templateUrl: './corriger-releve-sheet.component.html',
  styleUrl: './corriger-releve-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CorrigerReleveSheetComponent {
  readonly open = input(false);
  readonly campagneId = input.required<string>();
  readonly releve = input<ReleveLigne | null>(null);
  readonly close = output<void>();
  readonly saved = output<CorrigerReleveMutation['corrigerReleve']>();

  private readonly campagnesService = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  // `type="number"` avec ngModel : Angular sélectionne NumberValueAccessor,
  // qui émet un NOMBRE dans (ngModelChange), pas la chaîne que la valeur
  // initiale ('' puis String(...)) laisserait croire. D'où `String(...)`
  // avant tout `.trim()` ci-dessous — l'appeler directement sur le signal
  // jette dès la première frappe (`.trim is not a function` sur un number).
  readonly nouvelIndex = signal<string | number>('');
  readonly observation = signal('');
  readonly loading = signal(false);

  readonly nomCible = computed(() => {
    const r = this.releve();
    if (!r) return '';
    return nomAbonne(r.abonnePrenom, r.abonneNom) || r.numeroAbonne;
  });

  /** `null` = valeur saisissable. Sinon, la clé i18n de l'erreur à afficher. */
  readonly erreur = computed<string | null>(() => {
    const r = this.releve();
    if (!r) return null;
    const brut = String(this.nouvelIndex()).trim();
    if (!brut) return null; // pas d'erreur tant que rien n'est saisi
    const val = Number.parseFloat(brut);
    if (Number.isNaN(val)) return 'CAMPAGNES.CORRIGER_RELEVE.ERREUR_NOMBRE';
    if (val < r.ancienIndex) return 'CAMPAGNES.CORRIGER_RELEVE.ERREUR_INFERIEUR';
    return null;
  });

  readonly peutValider = computed(() => {
    const brut = String(this.nouvelIndex()).trim();
    return brut !== '' && this.erreur() === null && !this.loading();
  });

  constructor() {
    // Réinitialise le formulaire à chaque ouverture, avec l'index actuel
    // pré-rempli — l'admin corrige une faute de frappe, il ne repart pas de zéro.
    let wasOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !wasOpen) this.init();
      wasOpen = isOpen;
    });
  }

  private init(): void {
    const r = this.releve();
    this.nouvelIndex.set(r ? String(r.nouveauIndex) : '');
    this.observation.set('');
  }

  async save(): Promise<void> {
    const r = this.releve();
    if (!r || !this.peutValider()) return;

    this.loading.set(true);
    try {
      const result = await this.campagnesService.corrigerReleve({
        campagneId: this.campagneId(),
        abonneId: r.abonneId,
        nouveauIndex: Number.parseFloat(String(this.nouvelIndex())),
        observation: this.observation().trim(),
      });
      this.saved.emit(result);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.loading.set(false);
    }
  }
}
