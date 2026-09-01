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
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CONFIG_UPDATED_SUB, TARIF_UPDATED_SUB } from '../../graphql/queries/configuration.queries';
import { ConfigurationService } from '../../core/configuration/configuration.service';
import { FacturesService } from '../../core/factures/factures.service';
import { ConfigParam, InfosSociete, TestEnvoiResult } from '../../shared/models/configuration.model';
import { Tarif } from '../../shared/models/facture.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { BottomSheetComponent } from '../../shared/components/bottom-sheet/bottom-sheet.component';
import { WhatsappLinkComponent } from './whatsapp-link/whatsapp-link.component';
import { ToastService } from '../../shared/services/toast.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { isValidCameroonPhone, normalizePhone, toLocalPhone } from '../../shared/utils/phone.utils';
import type { ConfigUpdatedSubscription, TarifUpdatedSubscription } from '../../graphql/generated';

/** Étape de relance affichée dans l'onglet « Relances & Impayés ». */
interface RelanceStep {
  logical: string;
  badgeClass: string;
  labelKey: string;
  hintKey: string;
}

/**
 * Correspondance clé logique → clé réelle du Config Service (`query { configs }`).
 * Clés figées : elles sont stables et initialisées automatiquement au 1er accès.
 * ⚠️ Les étapes 3 et 4 ne suivent PAS le motif `rappel_3/4` — ce sont
 * `impaye_delai_avertissement` et `impaye_delai_suspension`.
 * La résolution reste normalisée (insensible casse/séparateurs) par sécurité.
 * NB : toutes les `valeur` du backend sont des strings ("0", "true", "5"…).
 */
const KEY_CANDIDATES: Record<string, string[]> = {
  rappel1: ['impaye_delai_rappel_1'],
  rappel2: ['impaye_delai_rappel_2'],
  avertissement: ['impaye_delai_avertissement'],
  suspension: ['impaye_delai_suspension'],
  suspensionAuto: ['impaye_suspension_auto'],
  pauseVersement: ['impaye_suspension_relances'],
  delaiPaiement: ['delai_paiement_jours'],
  tokenValidite: ['token_validite_jours'],
  notifAdminActives: ['notifications_admin_activees'],
  emailAdmin: ['email_admin_notifications'],
};

const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

@Component({
  selector: 'app-configuration',
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    RouterLink,
    InputTextModule,
    ErrorBannerComponent,
    PageTopbarComponent,
    SkeletonComponent,
    WhatsappLinkComponent,
    ConfirmDialogModule,
    BottomSheetComponent,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationComponent implements OnInit {
  private readonly service = inject(ConfigurationService);
  private readonly facturesService = inject(FacturesService);
  private readonly toast = inject(ToastService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly apollo = inject(Apollo);
  private readonly destroyRef = inject(DestroyRef);

  // ── État global ────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  /** 0=Société & Tarif · 1=Relances · 2=Utilisateurs · 3=WhatsApp & Tokens */
  readonly activeTab = signal(0);

  // ── Infos société (édition directe, persistée par le bouton global) ─────────
  readonly infosSociete = signal<InfosSociete | null>(null);
  readonly societeNom = signal('');
  readonly societeAdresse = signal('');
  readonly societeTelephone = signal('');
  readonly societeLogoPath = signal('');
  readonly societeDirty = computed(() => {
    const s = this.infosSociete();
    if (!s) return false;
    return (
      this.societeNom() !== s.nom ||
      this.societeAdresse() !== s.adresse ||
      this.societeTelephone() !== s.telephone ||
      this.societeLogoPath() !== s.logoPath
    );
  });

  // ── Tarif actuel (action dédiée « Modifier le tarif ») ──────────────────────
  readonly tarifActuel = signal<Tarif | null>(null);
  readonly editingTarif = signal(false);
  readonly tarifPrixM3 = signal('');
  readonly tarifDateEffet = signal('');
  readonly tarifSaving = signal(false);
  readonly tarifDirty = computed(() => {
    const t = this.tarifActuel();
    const prix = Number.parseFloat(this.tarifPrixM3());
    if (Number.isNaN(prix) || prix <= 0) return false;
    if (!this.tarifDateEffet()) return false;
    if (!t) return true;
    return prix !== t.prixM3 || this.tarifDateEffet() !== t.dateEffet;
  });

  // ── Paramètres système mappés (relances, pause, tokens…) ────────────────────
  readonly configs = signal<ConfigParam[]>([]);
  /** clé logique → clé réelle backend (null si absente) */
  readonly paramKeys = signal<Record<string, string | null>>({});
  /** clé logique → valeur éditée */
  readonly paramValues = signal<Record<string, string>>({});
  /** clé logique → valeur d'origine (pour le suivi des modifications) */
  private readonly paramOriginals = signal<Record<string, string>>({});

  readonly relanceSteps: readonly RelanceStep[] = [
    { logical: 'rappel1', badgeClass: 'step-badge--doux', labelKey: 'CONFIGURATION.RELANCE.ETAPE_1', hintKey: 'CONFIGURATION.RELANCE.HINT_1' },
    { logical: 'rappel2', badgeClass: 'step-badge--ferme', labelKey: 'CONFIGURATION.RELANCE.ETAPE_2', hintKey: 'CONFIGURATION.RELANCE.HINT_2' },
    { logical: 'avertissement', badgeClass: 'step-badge--avert', labelKey: 'CONFIGURATION.RELANCE.ETAPE_3', hintKey: 'CONFIGURATION.RELANCE.HINT_3' },
    { logical: 'suspension', badgeClass: 'step-badge--susp', labelKey: 'CONFIGURATION.RELANCE.ETAPE_4', hintKey: 'CONFIGURATION.RELANCE.HINT_4' },
  ];

  readonly configDirty = computed(() => {
    const v = this.paramValues();
    const o = this.paramOriginals();
    return Object.keys(o).some((k) => (v[k] ?? '') !== (o[k] ?? ''));
  });

  readonly dirty = computed(() => this.societeDirty() || this.configDirty());

  // ── WhatsApp : test d'envoi + révocation en masse des tokens ────────────────
  /** Numéro destinataire de l'envoi de test (prérempli avec le tél. société). */
  readonly waTestPhone = signal('');
  readonly waTesting = signal(false);
  /** Dernier résultat de test (succès ou motif d'échec) affiché sous le bouton. */
  readonly waTestResult = signal<TestEnvoiResult | null>(null);
  readonly revoking = signal(false);

  ngOnInit(): void {
    void this.load().then(() => {
      this.ecouterParametres();
      this.ecouterTarif();
    });
  }

  /**
   * `configUpdated` : un paramètre changé par un autre administrateur.
   *
   * Le principe qui gouverne les deux flux de cet écran : **une saisie en cours
   * gagne toujours sur un événement distant.** C'est un formulaire, pas une
   * liste. Écraser le champ qu'on est en train de remplir pour y mettre la
   * valeur d'un collègue serait la pire façon d'être « à jour » — et l'admin
   * enregistrerait ensuite sans voir ce qu'il vient de perdre.
   *
   * On ne recopie donc dans le formulaire que si rien n'y a été touché. Sinon
   * on met à jour la liste de référence en silence, et le prochain
   * enregistrement — ou le prochain chargement — remettra tout d'aplomb.
   *
   * Limite connue, côté serveur : `config` publie sur `UpdateConfig` mais pas
   * sur `UpdateInfosSociete`. Le nom, l'adresse et le téléphone de la régie ne
   * remontent donc pas par ce flux.
   */
  private ecouterParametres(): void {
    this.apollo
      .subscribe<ConfigUpdatedSubscription>({ query: CONFIG_UPDATED_SUB,
        context: { silentError: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const maj = data?.configUpdated;
          if (!maj) return;
          const fusionnes = (() => {
            const liste = this.configs();
            return liste.some((c) => c.cle === maj.cle)
              ? liste.map((c) => (c.cle === maj.cle ? { ...c, ...maj } : c))
              : [...liste, maj];
          })();
          this.configs.set(fusionnes);
          // Le formulaire n'est réaligné que s'il est vierge de modifications.
          if (!this.configDirty()) this.applyConfigs(fusionnes);
        },
        error: () => {
          /* temps réel indisponible — l'écran garde ses valeurs chargées */
        },
      });
  }

  /**
   * `tarifUpdated` : le prix au m³ vient de changer.
   *
   * Le tarif est la valeur la plus lourde de conséquence de toute l'application
   * — il détermine chaque montant facturé. Deux administrateurs qui le
   * modifient à quelques minutes d'intervalle, chacun sur sa page chargée
   * avant l'autre, produisent un écrasement silencieux. Voir la bannière
   * « en vigueur » changer sous ses yeux est précisément ce qui évite cela.
   *
   * Même règle que ci-dessus : si une modification de tarif est en cours de
   * saisie, on l'épargne et on se contente de rafraîchir la valeur de
   * référence affichée à droite.
   */
  private ecouterTarif(): void {
    this.apollo
      .subscribe<TarifUpdatedSubscription>({ query: TARIF_UPDATED_SUB,
        context: { silentError: true },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const t = data?.tarifUpdated;
          if (!t) return;
          // `tarifDirty` se compare au tarif de référence : il faut le lire
          // *avant* de remplacer celui-ci, sinon on compare la saisie en cours
          // à la valeur qui vient d'arriver et une saisie identique au nouveau
          // tarif passerait pour vierge.
          const saisieEnCours = this.tarifDirty();
          this.tarifActuel.set(t);
          if (!saisieEnCours) {
            this.tarifPrixM3.set(String(t.prixM3));
            this.tarifDateEffet.set(t.dateEffet);
          }
        },
        error: () => {
          /* temps réel indisponible — l'écran garde le tarif chargé */
        },
      });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [infos, configs, tarif] = await Promise.all([
        this.service.getInfosSociete(),
        this.service.getConfigs(),
        this.facturesService.getTarifActuel(),
      ]);
      this.infosSociete.set(infos);
      this.societeNom.set(infos.nom);
      this.societeAdresse.set(infos.adresse);
      this.societeTelephone.set(infos.telephone);
      this.societeLogoPath.set(infos.logoPath);
      // Préremplissage du destinataire de test (l'admin teste souvent sur son propre n°).
      // Préremplissage au format local (retire un éventuel +237 déjà présent).
      if (!this.waTestPhone()) this.waTestPhone.set(toLocalPhone(infos.telephone));
      this.configs.set(configs);
      this.applyConfigs(configs);
      this.tarifActuel.set(tarif);
      if (tarif) {
        this.tarifPrixM3.set(String(tarif.prixM3));
        this.tarifDateEffet.set(tarif.dateEffet);
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('CONFIGURATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private applyConfigs(configs: ConfigParam[]): void {
    const keys: Record<string, string | null> = {};
    const vals: Record<string, string> = {};
    for (const [logical, candidates] of Object.entries(KEY_CANDIDATES)) {
      const wanted = new Set(candidates.map(normKey));
      const found = configs.find((c) => wanted.has(normKey(c.cle)));
      keys[logical] = found?.cle ?? null;
      vals[logical] = found?.valeur ?? '';
    }
    this.paramKeys.set(keys);
    this.paramValues.set({ ...vals });
    this.paramOriginals.set({ ...vals });
  }

  // ── Accès aux paramètres mappés ─────────────────────────────────────────────

  getParam(logical: string): string {
    return this.paramValues()[logical] ?? '';
  }

  // Les inputs `type="number"` émettent un number|null via ngModel ; on
  // normalise en string pour rester aligné sur le backend (valeurs toujours
  // string) — sinon le suivi « dirty » et le .trim() de saveAll casseraient.
  setParam(logical: string, value: string | number | null): void {
    const str = value == null ? '' : String(value);
    this.paramValues.update((m) => ({ ...m, [logical]: str }));
  }

  hasParam(logical: string): boolean {
    return !!this.paramKeys()[logical];
  }

  isBoolOn(logical: string): boolean {
    return this.getParam(logical) === 'true';
  }

  toggleBool(logical: string): void {
    if (!this.hasParam(logical)) return;
    this.setParam(logical, this.isBoolOn(logical) ? 'false' : 'true');
  }

  setTab(index: number): void {
    this.activeTab.set(index);
  }

  // ── Sauvegarde globale (société + paramètres modifiés) ──────────────────────

  async saveAll(): Promise<void> {
    if (this.saving() || !this.dirty()) return;
    this.saving.set(true);
    try {
      if (this.societeDirty()) {
        const updated = await this.service.updateInfosSociete({
          nom: this.societeNom().trim(),
          adresse: this.societeAdresse().trim(),
          telephone: this.societeTelephone().trim(),
          logoPath: this.societeLogoPath().trim(),
        });
        this.infosSociete.set(updated);
      }

      const v = this.paramValues();
      const o = this.paramOriginals();
      const keys = this.paramKeys();
      const changed = Object.keys(o).filter((k) => (v[k] ?? '') !== (o[k] ?? ''));
      for (const logical of changed) {
        const cle = keys[logical];
        if (cle) {
          const updated = await this.service.updateConfig(cle, (v[logical] ?? '').trim());
          this.configs.update((list) =>
            list.map((c) => (c.cle === updated.cle ? updated : c)),
          );
        }
      }
      this.paramOriginals.set({ ...v });

      this.toast.success(this.translate.instant('CONFIGURATION.SUCCESS_SAVE'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Tarif actuel (action dédiée, non rétroactive — RV-004) ──────────────────

  editTarif(): void {
    const t = this.tarifActuel();
    this.tarifPrixM3.set(t ? String(t.prixM3) : '');
    this.tarifDateEffet.set(new Date().toISOString().slice(0, 10));
    this.editingTarif.set(true);
  }

  resetTarif(): void {
    const t = this.tarifActuel();
    this.tarifPrixM3.set(t ? String(t.prixM3) : '');
    this.tarifDateEffet.set(t?.dateEffet ?? '');
    this.editingTarif.set(false);
  }

  async saveTarif(): Promise<void> {
    if (this.tarifSaving() || !this.tarifDirty()) return;
    this.tarifSaving.set(true);
    try {
      const updated = await this.facturesService.updateTarif(
        Number.parseFloat(this.tarifPrixM3()),
        this.tarifDateEffet(),
      );
      this.tarifActuel.set(updated);
      this.editingTarif.set(false);
      this.toast.success(this.translate.instant('CONFIGURATION.SUCCESS_TARIF'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.tarifSaving.set(false);
    }
  }

  // ── WhatsApp : test d'envoi ─────────────────────────────────────────────────

  /**
   * Envoie un message de test au numéro saisi. Le backend renvoie
   * { success, message } : sur échec de livraison, success=false + le motif
   * exact (« WhatsApp non connecté… ») — affiché tel quel. Un numéro vide est
   * bloqué côté front (le backend le traiterait en vraie erreur INVALID_ARGUMENT).
   */
  async testWhatsapp(): Promise<void> {
    const local = this.waTestPhone().trim();
    if (!local || this.waTesting()) return;
    // Convention projet : saisie locale 6XXXXXXXX → on préfixe +237 avant l'envoi.
    if (!isValidCameroonPhone(local)) {
      this.waTestResult.set({
        success: false,
        message: this.translate.instant('CONFIGURATION.WHATSAPP_TEST_INVALID'),
      });
      return;
    }
    this.waTesting.set(true);
    this.waTestResult.set(null);
    try {
      const result = await this.service.testerEnvoiWhatsapp(normalizePhone(local));
      this.waTestResult.set(result);
      this.toast.show({ type: result.success ? 'success' : 'warning', title: result.message });
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      const fallback = message || this.translate.instant('ERRORS.GENERIC');
      this.waTestResult.set({ success: false, message: fallback });
      this.toast.error(fallback);
    } finally {
      this.waTesting.set(false);
    }
  }

  // ── WhatsApp : révocation en masse des tokens abonnés ───────────────────────

  confirmRevokeTokens(): void {
    if (this.revoking()) return;
    this.confirmationService.confirm({
      header: this.translate.instant('CONFIGURATION.TOKEN_REVOKE_CONFIRM_TITLE'),
      message: this.translate.instant('CONFIGURATION.TOKEN_REVOKE_CONFIRM'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('CONFIGURATION.TOKEN_REVOKE_BTN'),
      rejectLabel: this.translate.instant('COMMON.CANCEL'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.revokeTokens(),
    });
  }

  private async revokeTokens(): Promise<void> {
    if (this.revoking()) return;
    this.revoking.set(true);
    try {
      const count = await this.service.revoquerTousTokensAbonnes();
      this.toast.success(this.translate.instant('CONFIGURATION.TOKEN_REVOKE_SUCCESS', { count }));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.revoking.set(false);
    }
  }
}
