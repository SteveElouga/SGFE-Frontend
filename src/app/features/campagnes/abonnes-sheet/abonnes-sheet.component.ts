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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';

interface AbonneActifRef {
  id: string;
  quartier: string | null;
  camp: number | null;
}

interface ZoneOption {
  key: string;
  quartier: string;
  camp: number;
  count: number;
}

/**
 * Feuille « Ajouter des abonnés » à une campagne DÉJÀ créée (#6). Le backend
 * autorise le rattachement tant que la campagne est PLANIFIEE ou EN_COURS, et la
 * mutation `ajouterAbonnesCampagne` est idempotente (doublons/non-ACTIF ignorés).
 * Sélection : tous les abonnés actifs, ou filtrés par zone (quartier + camp),
 * cohérente avec le formulaire de création. Réservée ADMIN/SUPERVISEUR (la query
 * `abonnesActifs` leur est ouverte).
 */
@Component({
  selector: 'app-abonnes-sheet',
  standalone: true,
  imports: [TranslatePipe, BottomSheetComponent],
  templateUrl: './abonnes-sheet.component.html',
  styleUrl: './abonnes-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonnesSheetComponent {
  private readonly service = inject(CampagnesService);
  private readonly abonnesService = inject(AbonnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly open = input(false);
  readonly campagneId = input.required<string>();

  readonly close = output<void>();
  readonly saved = output<void>();

  private readonly abonnes = signal<AbonneActifRef[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal(false);
  readonly mode = signal<'TOUS' | 'FILTRE'>('TOUS');
  readonly selectedZones = signal<Set<string>>(new Set());

  private loaded = false;

  readonly zones = computed<ZoneOption[]>(() => {
    const map = new Map<string, ZoneOption>();
    for (const a of this.abonnes()) {
      const quartier = (a.quartier ?? '').trim();
      if (!quartier) continue;
      const camp = a.camp ?? 0;
      const key = this.zoneKey(a);
      const z = map.get(key);
      if (z) z.count += 1;
      else map.set(key, { key, quartier, camp, count: 1 });
    }
    return [...map.values()].sort((x, y) => x.quartier.localeCompare(y.quartier, 'fr') || x.camp - y.camp);
  });

  /** Nombre d'abonnés couverts par la sélection courante. */
  readonly count = computed(() => this.resolveIds().length);

  constructor() {
    // Charge à la première ouverture, ré-initialise la sélection à chaque
    // ouverture (writes déférés hors de l'effect via microtask).
    effect(() => {
      if (this.open()) queueMicrotask(() => void this.onOpened());
    });
  }

  private async onOpened(): Promise<void> {
    this.mode.set('TOUS');
    this.selectedZones.set(new Set());
    if (!this.loaded) await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.abonnes.set(await this.abonnesService.getAbonnesActifs());
      this.loaded = true;
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private zoneKey(a: AbonneActifRef): string {
    return `${(a.quartier ?? '').trim()}##${a.camp ?? 0}`;
  }

  selectMode(m: 'TOUS' | 'FILTRE'): void {
    this.mode.set(m);
  }

  toggleZone(key: string): void {
    const set = new Set(this.selectedZones());
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.selectedZones.set(set);
  }

  isSelected(key: string): boolean {
    return this.selectedZones().has(key);
  }

  private resolveIds(): string[] {
    const abonnes = this.abonnes();
    if (this.mode() === 'TOUS') return abonnes.map((a) => a.id);
    const zones = this.selectedZones();
    if (!zones.size) return [];
    return abonnes.filter((a) => zones.has(this.zoneKey(a))).map((a) => a.id);
  }

  async onSave(): Promise<void> {
    if (this.saving()) return;
    const ids = this.resolveIds();
    if (!ids.length) return;
    this.saving.set(true);
    try {
      const res = await this.service.ajouterAbonnesCampagne(this.campagneId(), ids);
      this.toast.success(
        this.translate.instant('CAMPAGNES.ABONNES_SHEET.SUCCESS', {
          ajoutes: res.nbAjoutes,
          ignores: res.nbIgnores,
        }),
      );
      this.saved.emit();
      this.close.emit();
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.saving.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
