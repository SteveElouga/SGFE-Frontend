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
import { extractGqlError } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AgentAffecte, ZoneDisponible, ZoneInput } from '../../../shared/models/campagne.model';
import { BottomSheetComponent } from '../../../shared/components/bottom-sheet/bottom-sheet.component';

/** Ligne de la feuille : une zone (quartier + camp) et son propriétaire actuel. */
interface ZoneRow {
  quartier: string;
  camp: number;
  nbAbonnes: number;
  ownerId: string | null;
  ownerUsername: string | null;
}

/**
 * Feuille d'affectation des **zones** à un agent d'une campagne.
 * Modèle backend : `AffectationZone` — une zone = un agent. Chaque relevé porte
 * l'`agent_id` dérivé de ses zones ; c'est cette affectation qui alimente la
 * tournée de l'agent (`relevesParAgent`). Sans elle, l'agent ne voit rien.
 *
 * `affecterZones(campagneId, agentId, zones)` **remplace** l'ensemble des zones
 * de l'agent → on envoie la sélection complète (ajouts + conservations). Les
 * zones déjà tenues par un AUTRE agent sont verrouillées (exclusivité).
 */
@Component({
  selector: 'app-zones-sheet',
  standalone: true,
  imports: [TranslatePipe, BottomSheetComponent],
  templateUrl: './zones-sheet.component.html',
  styleUrl: './zones-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZonesSheetComponent {
  private readonly service = inject(CampagnesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly open = input(false);
  readonly campagneId = input.required<string>();
  readonly agentId = input.required<string>();
  readonly agentUsername = input('');
  /** Tous les agents affectés (avec leurs zones) — pour l'exclusivité. */
  readonly agents = input<AgentAffecte[]>([]);

  readonly close = output<void>();
  readonly saved = output<void>();

  private readonly allZones = signal<ZoneDisponible[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  // Vrai si le catalogue de zones n'a pas pu être chargé : bloque un
  // enregistrement qui, sur une liste vide par échec, effacerait toutes les
  // zones de l'agent (affecterZones remplace l'ensemble).
  readonly loadError = signal(false);
  readonly selectedKeys = signal<Set<string>>(new Set());

  private loadedZones = false;

  /** Zones disponibles + propriétaire courant, calculées depuis `agents`. */
  readonly rows = computed<ZoneRow[]>(() => {
    const owners = new Map<string, { id: string; username: string }>();
    for (const ag of this.agents()) {
      for (const z of ag.zones ?? []) {
        owners.set(this.key(z.quartier, z.camp), { id: ag.agentId, username: ag.username });
      }
    }
    return this.allZones()
      .map((z): ZoneRow => {
        const owner = owners.get(this.key(z.quartier, z.camp)) ?? null;
        return {
          quartier: z.quartier,
          camp: z.camp,
          nbAbonnes: z.nbAbonnes,
          ownerId: owner?.id ?? null,
          ownerUsername: owner?.username ?? null,
        };
      })
      .sort((a, b) => a.quartier.localeCompare(b.quartier, 'fr') || a.camp - b.camp);
  });

  readonly selectedCount = computed(() => this.selectedKeys().size);
  readonly selectedAbonnes = computed(() => {
    const keys = this.selectedKeys();
    return this.rows()
      .filter((r) => keys.has(this.key(r.quartier, r.camp)))
      .reduce((sum, r) => sum + r.nbAbonnes, 0);
  });

  constructor() {
    // Charge les zones à la première ouverture, ré-initialise la sélection à
    // chaque ouverture (writes déférés hors de l'effect via microtask).
    effect(() => {
      if (this.open()) queueMicrotask(() => void this.onOpened());
    });
  }

  private async onOpened(): Promise<void> {
    // Ne charger qu'une fois, mais réessayer aux ouvertures suivantes si le
    // chargement a échoué (loadedZones passe à true uniquement en cas de succès).
    if (!this.loadedZones) {
      await this.loadZones();
    }
    this.initSelection();
  }

  private async loadZones(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.allZones.set(await this.service.getZonesDisponibles());
      this.loadedZones = true;
    } catch (err: unknown) {
      // Échec de chargement : on le signale explicitement. Sans ce marqueur, une
      // liste vide par échec serait indistinguable d'un catalogue réellement
      // vide, et l'enregistrement effacerait toutes les zones de l'agent.
      this.loadError.set(true);
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('CAMPAGNES.ZONES_SHEET.LOAD_ERROR'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Pré-coche les zones déjà détenues par l'agent courant. */
  private initSelection(): void {
    const mine = new Set<string>();
    const id = this.agentId();
    for (const r of this.rows()) {
      if (r.ownerId === id) mine.add(this.key(r.quartier, r.camp));
    }
    this.selectedKeys.set(mine);
  }

  private key(quartier: string, camp: number | null): string {
    return `${quartier}##${camp ?? ''}`;
  }

  isSelected(r: ZoneRow): boolean {
    return this.selectedKeys().has(this.key(r.quartier, r.camp));
  }

  isLocked(r: ZoneRow): boolean {
    return r.ownerId !== null && r.ownerId !== this.agentId();
  }

  toggle(r: ZoneRow): void {
    if (this.isLocked(r)) return; // zone d'un autre agent — exclusivité
    const k = this.key(r.quartier, r.camp);
    const set = new Set(this.selectedKeys());
    if (set.has(k)) set.delete(k);
    else set.add(k);
    this.selectedKeys.set(set);
  }

  onClose(): void {
    this.close.emit();
  }

  async onSave(): Promise<void> {
    if (this.saving()) return;
    // Filet de sécurité : si le catalogue n'a pas pu être chargé, la sélection
    // est vide par défaut d'affichage — enregistrer effacerait TOUTES les zones
    // de l'agent. On refuse plutôt que de détruire silencieusement.
    if (this.loadError()) {
      this.toast.error(this.translate.instant('CAMPAGNES.ZONES_SHEET.LOAD_ERROR'));
      return;
    }
    this.saving.set(true);
    try {
      const keys = this.selectedKeys();
      const zones: ZoneInput[] = this.rows()
        .filter((r) => keys.has(this.key(r.quartier, r.camp)))
        .map((r) => ({ quartier: r.quartier, camp: r.camp }));
      await this.service.affecterZones(this.campagneId(), this.agentId(), zones);
      this.toast.success(
        this.translate.instant('CAMPAGNES.ZONES_SHEET.SUCCESS', { agent: this.agentUsername() }),
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
}
