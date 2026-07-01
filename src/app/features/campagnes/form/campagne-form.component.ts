import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { formatPeriodeCampagne } from '../../../shared/models/campagne.model';
import { GET_USERS } from '../../../graphql/queries/users.queries';
import { GET_ABONNES_ACTIFS } from '../../../graphql/queries/abonnes.queries';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';

interface Agent {
  id: string;
  username: string;
  role: string;
}

@Component({
  selector: 'app-campagne-form',
  imports: [RouterLink, FormsModule, ToastModule, PageTopbarComponent, TranslatePipe],
  providers: [MessageService],
  templateUrl: './campagne-form.component.html',
  styleUrl: './campagne-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampagneFormComponent implements OnInit {
  private readonly service = inject(CampagnesService);
  private readonly apollo = inject(Apollo);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
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

  // ── Abonnés count ───────────────────────────────────────────────────────────
  readonly nbAbonnesActifs = signal<number | null>(null);

  // ── Identification ──────────────────────────────────────────────────────────
  readonly formNom = signal('');
  readonly formDatePlanifiee = signal('');

  // ── Abonnés sélection ───────────────────────────────────────────────────────
  readonly selectionMode = signal<'TOUS' | 'FILTRE'>('TOUS');

  // ── Options ─────────────────────────────────────────────────────────────────
  readonly genererFactures = signal(true);
  readonly envoyerWhatsApp = signal(true);

  // ── Submit ──────────────────────────────────────────────────────────────────
  readonly submitting = signal(false);

  readonly formValid = computed(
    () => this.formNom().trim().length > 0 && this.formDatePlanifiee().length > 0,
  );

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
    void this.loadNbAbonnesActifs();
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
      // sidebar reste fonctionnelle sans agents
    }
  }

  private async loadNbAbonnesActifs(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apollo.query<{ abonnesActifs: { id: string }[] }>({
          query: GET_ABONNES_ACTIFS,
          fetchPolicy: 'cache-first',
        }),
      );
      this.nbAbonnesActifs.set(result.data?.abonnesActifs?.length ?? null);
    } catch {
      // non critique — le compteur reste absent
    }
  }

  toggleAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.selectedAgentIds.set(set);
  }

  removeAgent(id: string): void {
    const set = new Set(this.selectedAgentIds());
    set.delete(id);
    this.selectedAgentIds.set(set);
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
      });
      for (const agentId of this.selectedAgentIds()) {
        await this.service.affecterAgent(campagne.campagneId, agentId);
      }
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('CAMPAGNES.SUCCESS_CREE'),
      });
      await this.router.navigate(['/campagnes']);
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || this.translate.instant('ERRORS.GENERIC'),
      });
    } finally {
      this.submitting.set(false);
    }
  }

  annuler(): void {
    void this.router.navigate(['/campagnes']);
  }
}
