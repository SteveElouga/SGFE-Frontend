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
import {
  isValidCameroonPhone,
  normalizePhone,
  toLocalPhone,
} from '../../../shared/utils/phone.utils';

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
  readonly submitAttempted = signal(false);

  // ── Champs ────────────────────────────────────────────────────────────────
  readonly nom = signal('');
  readonly prenom = signal('');
  readonly telephoneWhatsapp = signal('');
  readonly adresse = signal('');
  readonly selectedStatut = signal<'ACTIF' | 'SUSPENDU'>('ACTIF');
  readonly quartier = signal('');
  readonly camp = signal('');
  readonly datePose = signal(new Date().toISOString().slice(0, 10));
  readonly numeroCompteur = signal('');
  readonly indexInitial = signal('0');

  readonly statutOptions: { label: string; value: 'ACTIF' | 'SUSPENDU' }[] = [
    { label: 'ACTIF', value: 'ACTIF' },
    { label: 'SUSPENDU', value: 'SUSPENDU' },
  ];

  // ── État touched par champ ────────────────────────────────────────────────
  readonly nomTouched = signal(false);
  readonly prenomTouched = signal(false);
  readonly phoneTouched = signal(false);
  readonly quartierTouched = signal(false);
  readonly campTouched = signal(false);
  readonly datePoseTouched = signal(false);
  readonly numeroCompteurTouched = signal(false);

  // ── Règles de validation ──────────────────────────────────────────────────
  private readonly nomError = computed(() => {
    const v = this.nom().trim();
    if (!v) return 'Le nom est requis';
    if (v.length < 2) return 'Minimum 2 caractères';
    return null;
  });

  private readonly prenomError = computed(() => {
    const v = this.prenom().trim();
    if (!v) return 'Le prénom est requis';
    if (v.length < 2) return 'Minimum 2 caractères';
    return null;
  });

  private readonly phoneError = computed(() => {
    const local = toLocalPhone(this.telephoneWhatsapp().trim());
    if (!local) return 'Le téléphone est requis';
    if (!isValidCameroonPhone(local)) return 'Format invalide — ex. 655 123 456';
    return null;
  });

  private readonly quartierError = computed(() => {
    const v = this.quartier().trim();
    if (!v) return 'Le quartier est requis';
    if (v.length < 2) return 'Minimum 2 caractères';
    return null;
  });

  private readonly campError = computed(() => {
    const raw = String(this.camp()).trim();
    if (!raw) return 'Le camp est requis';
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1) return 'Entier ≥ 1 requis';
    return null;
  });

  private readonly datePoseError = computed(() => {
    if (this.mode !== 'create') return null;
    if (!this.datePose()) return 'La date est requise';
    return null;
  });

  private readonly numeroCompteurError = computed(() => {
    if (this.mode !== 'create') return null;
    const raw = String(this.numeroCompteur()).trim();
    if (!raw) return 'Le N° de compteur est requis';
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1) return 'Entier ≥ 1 requis';
    return null;
  });

  // ── Erreurs affichées (after blur ou after submit) ─────────────────────────
  readonly nomFieldError = computed(() =>
    this.nomTouched() || this.submitAttempted() ? this.nomError() : null,
  );
  readonly prenomFieldError = computed(() =>
    this.prenomTouched() || this.submitAttempted() ? this.prenomError() : null,
  );
  readonly phoneFieldError = computed(() =>
    this.phoneTouched() || this.submitAttempted() ? this.phoneError() : null,
  );
  readonly quartierFieldError = computed(() =>
    this.quartierTouched() || this.submitAttempted() ? this.quartierError() : null,
  );
  readonly campFieldError = computed(() =>
    this.campTouched() || this.submitAttempted() ? this.campError() : null,
  );
  readonly datePoseFieldError = computed(() =>
    this.datePoseTouched() || this.submitAttempted() ? this.datePoseError() : null,
  );
  readonly numeroCompteurFieldError = computed(() =>
    this.numeroCompteurTouched() || this.submitAttempted()
      ? this.numeroCompteurError()
      : null,
  );

  // ── Validité globale ──────────────────────────────────────────────────────
  readonly canSubmit = computed(() => {
    if (this.saving()) return false;
    const baseValid = !this.nomError() && !this.prenomError() && !this.phoneError();
    if (this.mode === 'create') {
      return (
        baseValid &&
        !this.quartierError() &&
        !this.campError() &&
        !this.datePoseError() &&
        !this.numeroCompteurError()
      );
    }
    return baseValid;
  });

  // ── Computed d'affichage ──────────────────────────────────────────────────
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

      this.nom.set(a.nom);
      this.prenom.set(a.prenom);
      this.telephoneWhatsapp.set(toLocalPhone(a.telephoneWhatsapp));
      this.adresse.set(a.adresse ?? '');
      if (a.statut === 'ACTIF' || a.statut === 'SUSPENDU') {
        this.selectedStatut.set(a.statut);
      }
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
    this.submitAttempted.set(true);
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

        const abonneInput: UpdateAbonneInput = {
          nom: this.nom().trim(),
          prenom: this.prenom().trim(),
          telephoneWhatsapp: this.normalizedTelephone(),
          adresse: this.adresse().trim() || undefined,
        };
        await this.abonnesService.updateAbonne(id, abonneInput);

        const originalStatut = this.abonne()?.statut;
        const newStatut = this.selectedStatut();
        if (originalStatut !== newStatut) {
          if (newStatut === 'SUSPENDU') {
            await this.abonnesService.suspendreAbonne(id);
          } else if (newStatut === 'ACTIF') {
            await this.abonnesService.reactiverAbonne(id);
          }
        }

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
