import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { BACKEND_CAPABILITIES } from '../../../core/config/backend-capabilities';
import { extractGqlError } from '../../../core/auth/auth.service';
import { formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { GET_USERS } from '../../../graphql/queries/users.queries';
import { GET_ABONNES_ACTIFS } from '../../../graphql/queries/abonnes.queries';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { ToastService } from '../../../shared/services/toast.service';

interface Agent {
  id: string;
  username: string;
  role: string;
}

interface AbonneActif {
  id: string;
  compteur?: {
    quartier: string;
    camp: number;
  };
}

@Component({
  selector: 'app-campagne-form',
  imports: [FormsModule, PageTopbarComponent, TranslatePipe],
  templateUrl: './campagne-form.component.html',
  styleUrl: './campagne-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneFormComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly apollo = inject(Apollo);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  readonly destroyRef = inject(DestroyRef);

  // ── Agents ─────────────────────────────────────────────────────────────────
  readonly agents = signal<Agent[]>([]);
  readonly selectedAgentIds = signal<Set<string>>(new Set());

  readonly selectedAgents = computed(() =>
    this.agents().filter((a) => this.selectedAgentIds().has(a.id)),
  );
  readonly availableAgents = computed(() =>
    this.agents().filter((a) => !this.selectedAgentIds().has(a.id)),
  );

  // ── Abonnés ─────────────────────────────────────────────────────────────────
  readonly abonnesActifs = signal<AbonneActif[] | null>(null);
  readonly nbAbonnesActifs = computed(() => this.abonnesActifs()?.length ?? null);

  // Zones disponibles, dédupliquées depuis abonne.compteur.quartier
  readonly zonesDisponibles = computed(() => {
    const abonnes = this.abonnesActifs();
    if (!abonnes) return [];
    const map = new Map<string, number>();
    for (const a of abonnes) {
      const zone = a.compteur?.quartier?.trim() ?? '';
      if (zone) map.set(zone, (map.get(zone) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
      .map(([zone, count]) => ({ zone, count }));
  });

  // Zones sélectionnées (mode FILTRE)
  readonly selectedZones = signal<Set<string>>(new Set());

  // Nb abonnés couverts selon le mode de sélection
  readonly nbAbonnesFiltres = computed(() => {
    const abonnes = this.abonnesActifs();
    if (!abonnes) return 0;
    if (this.selectionMode() === 'TOUS') return abonnes.length;
    const zones = this.selectedZones();
    if (zones.size === 0) return 0;
    return abonnes.filter((a) => {
      const zone = a.compteur?.quartier?.trim() ?? '';
      return zones.has(zone);
    }).length;
  });

  // ── Identification ──────────────────────────────────────────────────────────
  readonly formNom = signal('');
  readonly formDatePlanifiee = signal('');

  // ── Abonnés sélection ───────────────────────────────────────────────────────
  readonly selectionMode = signal<'TOUS' | 'FILTRE'>('TOUS');
  /**
   * `filtreZones` n'existe pas encore sur `CreateCampagneInput` côté backend
   * (voir `backend-capabilities.ts`) : le mode FILTRE resterait sans effet
   * (campagne créée pour TOUS les abonnés malgré la sélection affichée). On
   * désactive donc ce choix tant que le champ n'est pas livré, plutôt que de
   * laisser une sélection qui ne serait pas respectée.
   */
  readonly filtreZonesReady = BACKEND_CAPABILITIES.CAMPAGNE_FILTRE_ZONES;

  selectSelectionMode(mode: 'TOUS' | 'FILTRE'): void {
    if (mode === 'FILTRE' && !this.filtreZonesReady) return;
    this.selectionMode.set(mode);
  }

  // ── Options ─────────────────────────────────────────────────────────────────
  readonly genererFacturesAuto = signal(true);
  readonly envoyerWhatsappAuto = signal(true);
  readonly formMobileMoney = signal('');

  // Mobile Money : 9 chiffres exactement ou vide
  readonly mobileMoneyValid = computed(() => {
    const v = this.formMobileMoney().trim();
    return v === '' || /^\d{9}$/.test(v);
  });

  // envoyerWhatsappAuto forcé à false si genererFacturesAuto est off
  readonly envoyerWhatsappEffectif = computed(() =>
    this.genererFacturesAuto() ? this.envoyerWhatsappAuto() : false,
  );

  // ── Submit ──────────────────────────────────────────────────────────────────
  readonly submitting = signal(false);

  readonly formValid = computed(() => {
    const nomOk = this.formNom().trim().length > 0;
    const dateOk = this.formDatePlanifiee().length > 0;
    const abonnesOk =
      this.selectionMode() === 'TOUS' || this.selectedZones().size > 0;
    return nomOk && dateOk && abonnesOk && this.mobileMoneyValid();
  });

  readonly submitLabel = computed(() => {
    const nom = this.formNom().trim();
    const prefix = this.translate.instant('CAMPAGNES.FORM.SUBMIT_PREFIX');
    return nom ? `${prefix} ${nom}` : prefix;
  });

  ngOnInit(): void {
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);

    const mois = next.getMonth() + 1;
    const annee = next.getFullYear();
    this.formNom.set(formatPeriodeCampagne(mois, annee));
    this.formDatePlanifiee.set(next.toISOString().split('T')[0]);

    void this.loadAgents();
    this.loadAbonnesActifs();
  }

  private async loadAgents(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apollo.query<{ users: Agent[] }>({
          query: GET_USERS,
          fetchPolicy: 'cache-first',
        }),
      );
      this.agents.set((result.data?.users ?? []).filter((u) => u.role === 'AGENT'));
    } catch {
      // agents non critiques
    }
  }

  private loadAbonnesActifs(): void {
    this.apollo
      .watchQuery<{ abonnesActifs: AbonneActif[] }>({
        query: GET_ABONNES_ACTIFS,
        fetchPolicy: 'cache-first',
      })
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          if (data?.abonnesActifs) {
            this.abonnesActifs.set(data.abonnesActifs as AbonneActif[]);
          }
        },
        error: () => this.abonnesActifs.set([]),
      });
  }

  toggleAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selectedAgentIds.set(set);
  }

  removeAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    set.delete(id);
    this.selectedAgentIds.set(set);
  }

  toggleZone(zone: string): void {
    const set = new Set(this.selectedZones());
    if (set.has(zone)) set.delete(zone);
    else set.add(zone);
    this.selectedZones.set(set);
  }

  async submit(): Promise<void> {
    if (!this.formValid() || this.submitting()) return;
    this.submitting.set(true);
    try {
      const date = new Date(this.formDatePlanifiee());
      const campagne = await this.service.creerCampagne({
        nom: this.formNom().trim(),
        periodeMois: date.getMonth() + 1,
        periodeAnnee: date.getFullYear(),
        datePlanifiee: this.formDatePlanifiee(),
        numeroMobileMoney: this.formMobileMoney().trim(),
        genererFacturesAuto: this.genererFacturesAuto(),
        envoyerWhatsappAuto: this.envoyerWhatsappEffectif(),
      });
      for (const agentId of this.selectedAgentIds()) {
        await this.service.affecterAgent(campagne.campagneId, agentId);
      }
      this.toast.success(this.translate.instant('CAMPAGNES.SUCCESS_CREE'));
      await this.router.navigate(['/campagnes']);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.submitting.set(false);
    }
  }

  annuler(): void {
    void this.router.navigate(['/campagnes']);
  }
}
