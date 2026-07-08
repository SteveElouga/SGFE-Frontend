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
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

interface AgentRow {
  id: string;
  username: string;
  phoneNumber: string;
  isActive: boolean;
}

/**
 * Bottom sheet d'affectation d'agents à une campagne (maquette MC-03).
 * ADMIN / SUPERVISEUR propriétaire. La liste vient de `agentsDisponibles`
 * (accessible au SUPERVISEUR, contrairement à `users`). Le backend n'expose que
 * `affecterAgent` (ajout) : les agents déjà affectés sont affichés cochés et
 * verrouillés ; on n'enregistre que les nouvelles affectations.
 */
@Component({
  selector: 'app-agents-sheet',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './agents-sheet.component.html',
  styleUrl: './agents-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentsSheetComponent {
  private readonly service = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly open = input(false);
  readonly campagneId = input.required<string>();
  readonly assignedUsernames = input<string[]>([]);

  readonly close = output<void>();
  readonly saved = output<void>();

  readonly agents = signal<AgentRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());

  private initiallyAssigned = new Set<string>();
  private loaded = false;

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = this.agents();
    if (!term) return list;
    return list.filter((a) => a.username.toLowerCase().includes(term));
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  constructor() {
    // Charge / réinitialise la sélection à chaque ouverture (writes déférés
    // hors de l'effect via microtask).
    effect(() => {
      if (this.open()) queueMicrotask(() => void this.onOpened());
    });
  }

  private async onOpened(): Promise<void> {
    if (!this.loaded) {
      this.loaded = true;
      await this.load();
    } else {
      this.initSelection();
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const agents = (await this.service.getAgentsDisponibles())
        .map((u) => ({
          id: u.id,
          username: u.username,
          phoneNumber: u.phoneNumber,
          isActive: u.isActive,
        }))
        .sort((a, b) => a.username.localeCompare(b.username, 'fr'));
      this.agents.set(agents);
      this.initSelection();
    } catch {
      // liste d'agents non critique
    } finally {
      this.loading.set(false);
    }
  }

  private initSelection(): void {
    const assigned = new Set(this.assignedUsernames());
    const ids = this.agents()
      .filter((a) => assigned.has(a.username))
      .map((a) => a.id);
    this.selectedIds.set(new Set(ids));
    this.initiallyAssigned = new Set(ids);
  }

  isSelected(a: AgentRow): boolean {
    return this.selectedIds().has(a.id);
  }

  isLocked(a: AgentRow): boolean {
    return this.initiallyAssigned.has(a.id);
  }

  toggle(a: AgentRow): void {
    if (!a.isActive || this.isLocked(a)) return; // compte désactivé / retrait non supporté
    const set = new Set(this.selectedIds());
    if (set.has(a.id)) set.delete(a.id);
    else set.add(a.id);
    this.selectedIds.set(set);
  }

  onSearch(value: string): void {
    this.search.set(value);
  }

  onClose(): void {
    this.close.emit();
  }

  async onSave(): Promise<void> {
    if (this.saving()) return;
    const toAssign = [...this.selectedIds()].filter((id) => !this.initiallyAssigned.has(id));
    if (toAssign.length === 0) {
      this.close.emit();
      return;
    }
    this.saving.set(true);
    try {
      for (const id of toAssign) {
        await this.service.affecterAgent(this.campagneId(), id);
      }
      this.toast.success(
        this.translate.instant('CAMPAGNES.AGENTS_SHEET.SUCCESS', { n: toAssign.length }),
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

  initial(username: string): string {
    return (username.charAt(0) || '?').toUpperCase();
  }
}
