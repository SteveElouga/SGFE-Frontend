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
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { extractGqlError } from '../../../core/auth/auth.service';
import {
  AbonnesService,
  CreateAbonneInput,
  UpdateAbonneInput,
  UpdateCompteurInput,
} from '../../../core/abonnes/abonnes.service';
import { Abonne } from '../../../shared/models/abonne.model';
import { normalizePhone, toLocalPhone } from '../../../shared/utils/phone.utils';

type FormMode = 'create' | 'edit';

@Component({
  imports: [FormsModule, RouterLink, ToastModule, InputTextModule, SelectModule],
  providers: [MessageService],
  templateUrl: './abonne-form.component.html',
  styleUrl: './abonne-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbonneFormComponent implements OnInit {
  private readonly abonnesService = inject(AbonnesService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly mode: FormMode;
  readonly abonneId: string | null;

  readonly abonne = signal<Abonne | null>(null);
  readonly pageLoading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);

  // ── Champs abonné (création + modification) ───────────────────────────────
  readonly nom = signal('');
  readonly prenom = signal('');
  readonly telephoneWhatsapp = signal('');
  readonly adresse = signal('');

  // Statut — modification uniquement (ACTIF ↔ SUSPENDU, RÉSILIÉ est readonly)
  readonly selectedStatut = signal<'ACTIF' | 'SUSPENDU'>('ACTIF');
  readonly statutOptions: { label: string; value: 'ACTIF' | 'SUSPENDU' }[] = [
    { label: 'ACTIF', value: 'ACTIF' },
    { label: 'SUSPENDU', value: 'SUSPENDU' },
  ];

  // ── Champs compteur (création + modification) ─────────────────────────────
  readonly quartier = signal('');
  readonly camp = signal('');

  // Création uniquement
  readonly datePose = signal(new Date().toISOString().slice(0, 10));
  readonly numeroCompteur = signal('');
  readonly indexInitial = signal('0');

  // ── Computed ──────────────────────────────────────────────────────────────

  readonly canSubmit = computed(() => {
    if (this.saving()) return false;
    const base =
      this.nom().trim().length > 0 &&
      this.prenom().trim().length > 0 &&
      this.telephoneWhatsapp().trim().length > 0;
    if (this.mode === 'create') {
      return (
        base &&
        this.quartier().trim().length > 0 &&
        !!this.camp() &&
        this.datePose().length > 0 &&
        !!this.numeroCompteur()
      );
    }
    return base;
  });

  readonly numeroAbonneDisplay = computed(() => this.abonne()?.numeroAbonne ?? '');
  readonly isResilie = computed(() => this.abonne()?.statut === 'RESILIE');

  readonly compteurDisplay = computed(() => {
    const n = this.abonne()?.compteur?.numeroCompteur;
    if (n === undefined) return '—';
    return `C-${String(n).padStart(4, '0')}`;
  });

  readonly dateSouscriptionDisplay = computed(() =>
    this.fmtDate(this.abonne()?.compteur?.datePose),
  );

  constructor(route: ActivatedRoute) {
    this.mode = route.snapshot.data['mode'] as FormMode;
    this.abonneId = route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
    if (this.mode === 'edit' && this.abonneId) {
      this.loadAbonne();
    }
  }

  private async loadAbonne(): Promise<void> {
    const id = this.abonneId;
    if (!id) return;

    this.pageLoading.set(true);
    this.loadError.set(null);
    try {
      const a = await this.abonnesService.getAbonne(id);
      this.abonne.set(a);

      // Champs abonné
      this.nom.set(a.nom);
      this.prenom.set(a.prenom);
      this.telephoneWhatsapp.set(toLocalPhone(a.telephoneWhatsapp));
      this.adresse.set(a.adresse ?? '');
      if (a.statut === 'ACTIF' || a.statut === 'SUSPENDU') {
        this.selectedStatut.set(a.statut);
      }

      // Champs compteur
      if (a.compteur) {
        this.quartier.set(a.compteur.quartier);
        this.camp.set(String(a.compteur.camp));
      }
    } catch (err: unknown) {
      const { code, message } = extractGqlError(err);
      if (code === 'NOT_FOUND') {
        this.router.navigateByUrl('/abonnes');
      } else {
        this.loadError.set(message || 'Impossible de charger la fiche abonné.');
      }
    } finally {
      this.pageLoading.set(false);
    }
  }

  fmtDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  private normalizedTelephone(): string {
    return normalizePhone(toLocalPhone(this.telephoneWhatsapp().trim()));
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    try {
      if (this.mode === 'create') {
        const input: CreateAbonneInput = {
          nom: this.nom().trim(),
          prenom: this.prenom().trim(),
          telephoneWhatsapp: this.normalizedTelephone(),
          adresse: this.adresse().trim() || undefined,
          numeroCompteur: Number.parseInt(this.numeroCompteur(), 10),
          quartier: this.quartier().trim(),
          camp: Number.parseInt(this.camp(), 10),
          indexInitial: Number.parseFloat(this.indexInitial()) || 0,
          datePose: this.datePose(),
        };
        await this.abonnesService.createAbonne(input);
        this.messageService.add({ severity: 'success', summary: 'Abonné créé avec succès' });
        await this.router.navigateByUrl('/abonnes');
      } else {
        const id = this.abonneId;
        if (!id) return;

        // 1 — Mise à jour des champs abonné
        const abonneInput: UpdateAbonneInput = {
          nom: this.nom().trim(),
          prenom: this.prenom().trim(),
          telephoneWhatsapp: this.normalizedTelephone(),
          adresse: this.adresse().trim() || undefined,
        };
        await this.abonnesService.updateAbonne(id, abonneInput);

        // 2 — Changement de statut si nécessaire (ACTIF ↔ SUSPENDU)
        const originalStatut = this.abonne()?.statut;
        const newStatut = this.selectedStatut();
        if (originalStatut !== newStatut) {
          if (newStatut === 'SUSPENDU') {
            await this.abonnesService.suspendreAbonne(id);
          } else if (newStatut === 'ACTIF') {
            await this.abonnesService.reactiverAbonne(id);
          }
        }

        // 3 — Mise à jour du compteur si quartier/camp ont changé
        const original = this.abonne()?.compteur;
        if (original) {
          const newQuartier = this.quartier().trim();
          const newCamp = Number.parseInt(this.camp(), 10);
          const compteurInput: UpdateCompteurInput = {};
          if (newQuartier && newQuartier !== original.quartier) {
            compteurInput.quartier = newQuartier;
          }
          if (!Number.isNaN(newCamp) && newCamp !== original.camp) {
            compteurInput.camp = newCamp;
          }
          if (Object.keys(compteurInput).length > 0) {
            await this.abonnesService.updateCompteur(id, compteurInput);
          }
        }

        this.messageService.add({ severity: 'success', summary: 'Modifications enregistrées' });
        await this.router.navigateByUrl(`/abonnes/${id}`);
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.messageService.add({
        severity: 'error',
        summary: message || 'Une erreur est survenue',
      });
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    const id = this.abonneId;
    if (this.mode === 'edit' && id) {
      this.router.navigateByUrl(`/abonnes/${id}`);
    } else {
      this.router.navigateByUrl('/abonnes');
    }
  }
}
