import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { extractGqlError } from '../../../core/auth/auth.service';
import { AbonnesService, RemplacerCompteurInput } from '../../../core/abonnes/abonnes.service';
import { Abonne } from '../../../shared/models/abonne.model';

@Component({
  imports: [
    FormsModule,
    RouterLink,
    ToastModule,
    ConfirmDialogModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './abonne-detail.component.html',
  styleUrl: './abonne-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonneDetailComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  private readonly abonneId: string;

  readonly abonne = signal<Abonne | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statutLoading = signal(false);

  // Onglets
  readonly activeTab = signal(0);


  // Modal remplacer compteur
  readonly remplacerVisible = signal(false);
  readonly newNumeroCompteur = signal('');
  readonly newQuartier = signal('');
  readonly newCamp = signal('');
  readonly newIndexInitial = signal('0');
  readonly newDatePose = signal('');
  readonly remplacerLoading = signal(false);

  readonly initial = computed(() => {
    const a = this.abonne();
    return a ? (a.nom[0] ?? '?').toUpperCase() : '?';
  });

  readonly localisationLine = computed(() => {
    const a = this.abonne();
    if (!a) return '';
    const parts = [a.numeroAbonne];
    if (a.compteur) {
      parts.push(`Compteur ${this.fmtCompteur(a.compteur.numeroCompteur)}`);
      parts.push(`${a.compteur.quartier}, Camp ${a.compteur.camp}`);
    }
    parts.push(a.telephoneWhatsapp);
    return parts.join(' · ');
  });

  readonly abonneDepuis = computed(() => {
    const a = this.abonne();
    if (!a) return '—';
    return new Date(a.createdAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  });

  readonly moisDepuis = computed(() => {
    const a = this.abonne();
    if (!a) return '';
    const d = new Date(a.createdAt);
    const now = new Date();
    const m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    return `${m} mois`;
  });

  constructor(route: ActivatedRoute) {
    this.abonneId = route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.loadAbonne();
  }

  async loadAbonne(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.abonne.set(await this.abonnesService.getAbonne(this.abonneId));
    } catch (err: unknown) {
      const { code, message } = extractGqlError(err);
      if (code === 'NOT_FOUND') {
        this.router.navigateByUrl('/abonnes');
      } else {
        this.error.set(message || 'Impossible de charger la fiche abonné.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  fmtCompteur(n: number): string {
    return `C-${String(n).padStart(4, '0')}`;
  }

  fmtDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  fmtCreatedAt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // ── Navigation formulaire ────────────────────────────────────────────────────

  goToEditForm(): void {
    this.router.navigateByUrl(`/abonnes/${this.abonneId}/modifier`);
  }

  // ── Actions statut ──────────────────────────────────────────────────────────

  async suspendre(): Promise<void> {
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.suspendreAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.messageService.add({ severity: 'warn', summary: 'Abonné suspendu' });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || 'Erreur' });
    } finally {
      this.statutLoading.set(false);
    }
  }

  async reactiver(): Promise<void> {
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.reactiverAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.messageService.add({ severity: 'success', summary: 'Abonné réactivé' });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || 'Erreur' });
    } finally {
      this.statutLoading.set(false);
    }
  }

  confirmerResiliation(): void {
    this.confirmationService.confirm({
      header: 'Résilier l\'abonnement ?',
      message: 'Cette action est irréversible. L\'abonné sera définitivement résilié.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Résilier',
      rejectLabel: 'Annuler',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.resilier(),
    });
  }

  private async resilier(): Promise<void> {
    this.statutLoading.set(true);
    try {
      const updated = await this.abonnesService.resilierAbonne(this.abonneId);
      this.abonne.update((a) => (a ? { ...a, statut: updated.statut } : a));
      this.messageService.add({ severity: 'info', summary: 'Abonnement résilié' });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || 'Erreur' });
    } finally {
      this.statutLoading.set(false);
    }
  }

  // ── Modal remplacer compteur ─────────────────────────────────────────────────

  openRemplacerModal(): void {
    const c = this.abonne()?.compteur;
    this.newNumeroCompteur.set('');
    this.newQuartier.set(c?.quartier ?? '');
    this.newCamp.set(c?.camp ? String(c.camp) : '');
    this.newIndexInitial.set('0');
    this.newDatePose.set(new Date().toISOString().slice(0, 10));
    this.remplacerVisible.set(true);
  }

  async saveRemplacer(): Promise<void> {
    const n = parseInt(this.newNumeroCompteur(), 10);
    const camp = parseInt(this.newCamp(), 10);
    const indexInitial = parseFloat(this.newIndexInitial());
    if (!n || !camp) return;

    this.remplacerLoading.set(true);
    const input: RemplacerCompteurInput = {
      numeroCompteur: n,
      quartier: this.newQuartier(),
      camp,
      indexInitial: isNaN(indexInitial) ? 0 : indexInitial,
      datePose: this.newDatePose(),
    };
    try {
      const newCompteur = await this.abonnesService.remplacerCompteur(this.abonneId, input);
      this.abonne.update((a) => (a ? { ...a, compteur: newCompteur } : a));
      this.remplacerVisible.set(false);
      this.messageService.add({ severity: 'success', summary: 'Compteur remplacé avec succès' });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({ severity: 'error', summary: message || 'Erreur lors du remplacement' });
    } finally {
      this.remplacerLoading.set(false);
    }
  }
}
