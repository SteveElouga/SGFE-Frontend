import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { Abonne, StatutAbonne } from '../../../shared/models/abonne.model';

@Component({
  selector: 'app-abonnes-list',
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './abonnes-list.component.html',
  styleUrl: './abonnes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonnesListComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly abonnes = signal<Abonne[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

  readonly filteredAbonnes = computed(() => {
    let list = this.abonnes();
    const term = this.searchTerm().toLowerCase().trim();
    const statut = this.statutFilter();
    const quartier = this.quartierFilter();

    if (statut) list = list.filter((a) => a.statut === statut);
    if (quartier) list = list.filter((a) => a.compteur?.quartier === quartier);
    if (term) {
      list = list.filter(
        (a) =>
          `${a.nom} ${a.prenom}`.toLowerCase().includes(term) ||
          a.numeroAbonne.toLowerCase().includes(term),
      );
    }
    return list;
  });

  readonly statutSummary = computed(() => {
    const all = this.abonnes();
    const actifs = all.filter((a) => a.statut === 'ACTIF').length;
    const suspendus = all.filter((a) => a.statut === 'SUSPENDU').length;
    const parts: string[] = [];
    if (actifs > 0) parts.push(`${actifs} actif${actifs > 1 ? 's' : ''}`);
    if (suspendus > 0) parts.push(`${suspendus} suspendu${suspendus > 1 ? 's' : ''}`);
    return parts.join(' · ');
  });

  readonly quartiersOptions = computed(() =>
    [
      ...new Set(
        this.abonnes()
          .map((a) => a.compteur?.quartier)
          .filter((q): q is string => !!q),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      .map((q) => ({ label: q, value: q })),
  );

  readonly statutOptions: Array<{ label: string; value: StatutAbonne }> = [
    { label: 'Actif', value: 'ACTIF' },
    { label: 'Suspendu', value: 'SUSPENDU' },
    { label: 'Résilié', value: 'RESILIE' },
  ];

  ngOnInit(): void {
    this.loadAbonnes();
  }

  async loadAbonnes(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const abonnes = await this.abonnesService.getAbonnes();
      this.abonnes.set(abonnes);
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.error.set(message || 'Impossible de charger la liste des abonnés.');
    } finally {
      this.loading.set(false);
    }
  }

  formatNumeroCompteur(n: number): string {
    return `C-${String(n).padStart(4, '0')}`;
  }

  voirAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}`);
  }

  modifierAbonne(id: string): void {
    this.router.navigateByUrl(`/abonnes/${id}/modifier`);
  }

  confirmReactiver(abonne: Abonne): void {
    this.confirmationService.confirm({
      header: `Réactiver ${abonne.nom} ${abonne.prenom} ?`,
      message: `L'abonné retrouvera un accès normal et sera inclus dans les prochaines campagnes de relevé.`,
      icon: 'pi pi-check-circle',
      acceptLabel: 'Réactiver',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.reactiverAbonne(abonne),
    });
  }

  private async reactiverAbonne(abonne: Abonne): Promise<void> {
    try {
      const updated = await this.abonnesService.reactiverAbonne(abonne.id);
      this.abonnes.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      this.messageService.add({
        severity: 'success',
        summary: 'Abonné réactivé',
        detail: `${abonne.nom} ${abonne.prenom} est de nouveau actif.`,
      });
    } catch (error: unknown) {
      const { message } = extractGqlError(error);
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: message || 'Impossible de réactiver cet abonné.',
      });
    }
  }
}
