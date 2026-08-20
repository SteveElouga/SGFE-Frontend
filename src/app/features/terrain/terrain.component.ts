import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { CampagnesService } from '../../core/campagnes/campagnes.service';
import { AuthService, extractGqlError } from '../../core/auth/auth.service';
import { OfflineSaisieService } from '../../core/terrain/offline-saisie.service';
import { Campagne, Releve } from '../../shared/models/campagne.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { FilterChipsComponent, FilterChip } from '../../shared/components/filter-chips/filter-chips.component';
import { M07SheetComponent, M07Result } from './m07-sheet/m07-sheet.component';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';

/**
 * Plafond au-delà duquel une consommation devient suspecte (garde-fou soft :
 * on n'empêche pas la saisie, on affiche un avertissement pour que l'agent
 * revérifie qu'il a bien lu son compteur avant validation).
 */
const CONSO_WARN_THRESHOLD_M3 = 500;
/** Plafond dur : au-delà, l'index est refusé. Évite le débordement UI et les
 *  erreurs de frappe massives (999999999) qui polluent la file offline. */
const NOUVEL_INDEX_MAX = 99_999_999;

/** Parseur strict : rejette "12abc", "12.5", "-5", accepte uniquement des entiers positifs. */
function parseIndex(raw: string): number | null {
  const s = raw.trim();
  if (s === '' || !/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

interface AbonneInfo {
  numeroAbonne: string;
  nom: string;
  prenom: string;
  numeroCompteur: number | null;
  quartier: string | null;
  camp: number | null;
}

type EntryStatus = 'A_RELEVER' | 'RELEVE' | 'ESTIME' | 'NON_RELEVE' | 'PENDING';
type Filtre = 'TOUS' | 'A_RELEVER' | 'RELEVE';
type View = 'list' | 'saisie' | 'success';

/** Ligne de la liste des relevés (écran 07). */
interface Entry {
  abonneId: string;
  nom: string;
  sub: string;
  detail: string;
  status: EntryStatus;
  ancienIndex: number;
  numeroAbonne: string;
  compteurLine: string;
}

interface SuccessInfo {
  abonneId: string;
  nom: string;
  numeroAbonne: string;
  ancienIndex: number;
  nouvelIndex: number;
  conso: number;
  ts: number;
}

@Component({
  imports: [FormsModule, DecimalPipe, LowerCasePipe, ToastModule, TranslatePipe, ErrorBannerComponent, FilterChipsComponent, M07SheetComponent],
  providers: [MessageService],
  templateUrl: './terrain.component.html',
  styleUrl: './terrain.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerrainComponent implements OnInit {
  private readonly campagnesService = inject(CampagnesService);
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  readonly offline = inject(OfflineSaisieService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly campagne = signal<Campagne | null>(null);
  readonly releves = signal<Releve[]>([]);

  readonly view = signal<View>('list');
  readonly filtre = signal<Filtre>('TOUS');

  // ── Saisie (écran 08) ───────────────────────────────────────────────────────
  readonly saisieEntry = signal<Entry | null>(null);
  readonly nouvelIndex = signal('');
  readonly observation = signal('');

  // ── Feuille M-07 : non relevé / estimé (formulaire délégué à M07SheetComponent) ──
  readonly m07Visible = signal(false);

  // ── Succès (écran 09) ───────────────────────────────────────────────────────
  readonly success = signal<SuccessInfo | null>(null);

  readonly agentNom = computed(() => this.auth.user()?.username ?? '');
  readonly campagneNom = computed(() => this.campagne()?.nom ?? '');

  /**
   * Identité de l'abonné directement depuis le relevé (jointe côté Gateway,
   * PR #92) : l'agent n'a pas accès au service Abonné, mais le relevé porte
   * désormais nom/n° abonné/compteur/zone. Repli sur l'id si champs vides
   * (best-effort backend : Abonné Service down → chaînes vides).
   */
  private carteAbonne(r: Releve): { nom: string; info: AbonneInfo } {
    const prenom = r.abonnePrenom ?? '';
    const nom = r.abonneNom ?? '';
    const full = `${prenom} ${nom}`.trim();
    const info: AbonneInfo = {
      numeroAbonne: r.numeroAbonne ?? '',
      nom,
      prenom,
      // 0 = compteur non résolu (jointure abonné best-effort côté Gateway, champ
      // Int non-nullable défaut 0) → traité comme absent, pas affiché « C-0000 ».
      numeroCompteur: r.numeroCompteur || null,
      quartier: r.quartier ?? null,
      camp: r.camp ?? null,
    };
    return { nom: full || r.abonneId, info };
  }

  private localisation(info: AbonneInfo | undefined): string {
    if (!info) return '';
    const parts: string[] = [];
    if (info.quartier) parts.push(info.quartier);
    if (info.camp != null) parts.push(`Camp ${info.camp}`);
    if (info.numeroCompteur != null) parts.push(`C-${String(info.numeroCompteur).padStart(4, '0')}`);
    return parts.join(' · ');
  }

  /** Liste unifiée : relevés serveur surchargés par la file locale. */
  readonly entries = computed((): Entry[] => {
    // Surcharge par abonné : le premier de la file (le plus récent) fait foi.
    const override = new Map<string, { status: EntryStatus; detail: string }>();
    for (const q of this.offline.queue()) {
      if (override.has(q.abonneId)) continue;
      override.set(q.abonneId, this.queueOverride(q));
    }

    return this.releves().map((r): Entry => {
      const { nom, info } = this.carteAbonne(r);
      const base = {
        abonneId: r.abonneId,
        nom,
        sub: this.localisation(info),
        ancienIndex: r.ancienIndex,
        numeroAbonne: info.numeroAbonne,
        compteurLine: this.saisieCompteurLine(info),
      };
      const ov = override.get(r.abonneId);
      if (ov) return { ...base, status: ov.status, detail: ov.detail };
      return { ...base, status: r.statut, detail: this.serverDetail(r) };
    });
  });

  private queueOverride(q: {
    state: string;
    kind: 'INDEX' | 'NON_RELEVE' | 'ESTIME';
    nouveauIndex: number | null;
    consommation: number | null;
    observation: string;
  }): { status: EntryStatus; detail: string } {
    if (q.state === 'PENDING' || q.state === 'ERROR') {
      let detail: string;
      if (q.kind === 'INDEX') {
        detail = this.translate.instant('TERRAIN.CARD_INDEX_SHORT', {
          index: (q.nouveauIndex ?? 0).toLocaleString('fr-FR'),
          conso: q.consommation ?? 0,
        });
      } else {
        detail = this.translate.instant(q.kind === 'ESTIME' ? 'TERRAIN.ESTIME' : 'TERRAIN.NON_RELEVE');
      }
      return { status: 'PENDING', detail };
    }
    // Synchronisé : reflété comme « fait » jusqu'au prochain rechargement serveur.
    if (q.kind === 'INDEX') {
      return { status: 'RELEVE', detail: this.translate.instant('TERRAIN.CARD_CONSO', { conso: q.consommation ?? 0 }) };
    }
    if (q.kind === 'ESTIME') return { status: 'ESTIME', detail: this.translate.instant('TERRAIN.ESTIME') };
    return { status: 'NON_RELEVE', detail: q.observation || this.translate.instant('TERRAIN.NON_RELEVE') };
  }

  private serverDetail(r: Releve): string {
    if (r.statut === 'RELEVE' || r.statut === 'ESTIME') {
      return this.translate.instant('TERRAIN.CARD_CONSO', { conso: r.consommation });
    }
    if (r.statut === 'NON_RELEVE') {
      return r.observation || this.translate.instant('TERRAIN.NON_RELEVE');
    }
    return this.translate.instant('TERRAIN.ANCIEN_IDX', { index: r.ancienIndex.toLocaleString('fr-FR') });
  }

  readonly countTous = computed(() => this.entries().length);
  readonly countARelever = computed(() => this.entries().filter((e) => e.status === 'A_RELEVER').length);
  readonly countReleve = computed(
    () => this.entries().filter((e) => e.status === 'RELEVE' || e.status === 'ESTIME' || e.status === 'PENDING').length,
  );

  readonly filteredEntries = computed((): Entry[] => {
    const f = this.filtre();
    const list = this.entries();
    if (f === 'A_RELEVER') return list.filter((e) => e.status === 'A_RELEVER');
    if (f === 'RELEVE') return list.filter((e) => e.status === 'RELEVE' || e.status === 'ESTIME' || e.status === 'PENDING');
    return list;
  });

  /** Options du composant partagé <app-filter-chips> (la pilule « Tous » est ajoutée automatiquement). */
  readonly filterOptions = computed((): FilterChip[] => [
    { label: 'TERRAIN.FILTER_A_RELEVER', value: 'A_RELEVER', count: this.countARelever() },
    { label: 'TERRAIN.FILTER_RELEVE',    value: 'RELEVE',    count: this.countReleve() },
  ]);

  readonly progressPct = computed(() => {
    const total = this.countTous();
    if (total === 0) return 0;
    return Math.round(((total - this.countARelever()) / total) * 100);
  });
  readonly nbFaits = computed(() => this.countTous() - this.countARelever());

  // ── Saisie : consommation live + validation (RV-001) ────────────────────────
  //
  // parseIndex() rejette les entrées mal formées (« 12abc », « 12.5 », « -5 »)
  // pour éviter les silences de Number.parseInt : mieux vaut un CTA désactivé
  // qu'un « 12.5 » silencieusement transformé en « 12 » dans la file offline.
  readonly consoLive = computed((): number | null => {
    const e = this.saisieEntry();
    const idx = parseIndex(this.nouvelIndex());
    if (!e || idx === null) return null;
    return idx - e.ancienIndex;
  });

  readonly indexInvalide = computed(() => {
    const e = this.saisieEntry();
    const raw = this.nouvelIndex();
    if (!e || raw.trim() === '') return false;
    const idx = parseIndex(raw);
    if (idx === null) return true;
    return idx < e.ancienIndex || idx > NOUVEL_INDEX_MAX;
  });

  readonly saisieValide = computed(() => {
    const e = this.saisieEntry();
    const idx = parseIndex(this.nouvelIndex());
    return !!e && idx !== null && idx >= e.ancienIndex && idx <= NOUVEL_INDEX_MAX;
  });

  /** Consommation supérieure au seuil habituel → avertissement soft (agent doit
   *  revérifier son relevé, on ne bloque pas la validation). */
  readonly consoWarn = computed(() => {
    const c = this.consoLive();
    return c !== null && c > CONSO_WARN_THRESHOLD_M3;
  });

  /** Prochain abonné à relever (hors abonné courant), pour l'écran de succès. */
  readonly prochain = computed((): Entry | null => {
    // Dédup sur abonneId (toujours présent/unique), jamais sur numeroAbonne : ce
    // dernier peut être vide (jointure abonné best-effort) et exclurait alors
    // TOUS les A_RELEVER restants → « Relever le suivant » n'enchaînerait plus.
    const currentId = this.success()?.abonneId;
    return this.entries().find((e) => e.status === 'A_RELEVER' && e.abonneId !== currentId) ?? null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // L'identité des abonnés (nom, n° abonné, compteur, zone) est portée par
      // les relevés eux-mêmes (jointe côté Gateway, PR #92) → plus besoin de
      // charger une carte d'abonnés (query `abonnes` de toute façon réservée
      // ADMIN). Voir carteAbonne().
      const campagnesRes = await firstValueFrom(
        this.apollo.query<{ campagnes: Array<Campagne & { statut: string }> }>({
          query: GET_CAMPAGNES,
          fetchPolicy: 'network-only',
        }),
      );

      const campagnes = campagnesRes.data?.campagnes ?? [];
      // Terrain = saisie, possible uniquement sur une campagne EN_COURS. On ne
      // retombe PAS sur une PLANIFIEE/CLOTUREE (non relevable) : sans campagne
      // active, l'écran affiche un état vide explicite plutôt qu'une campagne
      // sur laquelle l'agent ne peut rien saisir (#15).
      const active = campagnes.find((c) => c.statut === 'EN_COURS') ?? null;
      this.campagne.set(active);

      if (active) {
        // Contrat C.9 : un AGENT ne voit QUE sa tournée —
        // `relevesParAgent(campagneId, sonId)` renvoie ses relevés saisis + les
        // A_RELEVER de ses zones (ou toute la campagne s'il n'a aucune zone,
        // décision prise côté service). On ne retombe JAMAIS sur `releves` (vue
        // complète) : ce serait une fuite de périmètre (relevés d'autres agents,
        // saisissables). Une tournée légitimement vide reste vide ; une vraie
        // erreur de chargement remonte à la bannière via le catch englobant.
        const user = this.auth.user();
        const releves =
          user?.role === 'AGENT'
            ? await this.campagnesService.getRelevesParAgent(active.campagneId, user.id)
            : await this.campagnesService.getReleves(active.campagneId);
        this.releves.set(releves);
        this.offline.clearSynced();
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('TERRAIN.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  private saisieCompteurLine(info: AbonneInfo | undefined): string {
    if (!info) return '';
    const parts: string[] = [];
    if (info.numeroCompteur != null) parts.push(`Compteur C-${String(info.numeroCompteur).padStart(4, '0')}`);
    if (info.quartier) parts.push(`${info.quartier}${info.camp != null ? `, Camp ${info.camp}` : ''}`);
    return parts.join(' · ');
  }

  // ── Navigation liste ────────────────────────────────────────────────────────

  setFiltre(f: Filtre): void {
    this.filtre.set(f);
  }

  /** Le composant <app-filter-chips> émet `null` pour « Tous » ; on remappe vers 'TOUS'. */
  onFilterChange(v: string | null): void {
    this.filtre.set(v === null ? 'TOUS' : (v as Filtre));
  }

  openSaisie(entry: Entry): void {
    if (entry.status !== 'A_RELEVER') return;
    this.saisieEntry.set(entry);
    this.nouvelIndex.set('');
    this.observation.set('');
    this.m07Visible.set(false);
    this.view.set('saisie');
  }

  backToList(): void {
    this.view.set('list');
    this.saisieEntry.set(null);
    this.m07Visible.set(false);
  }

  // ── Saisie (écran 08) ───────────────────────────────────────────────────────

  confirmSaisie(): void {
    const e = this.saisieEntry();
    const campagne = this.campagne();
    if (!e || !campagne || !this.saisieValide()) return;
    const nouveauIndex = parseIndex(this.nouvelIndex());
    if (nouveauIndex === null) return;
    const conso = nouveauIndex - e.ancienIndex;
    this.offline.enqueue({
      kind: 'INDEX',
      campagneId: campagne.campagneId,
      abonneId: e.abonneId,
      abonneNom: e.nom,
      nouveauIndex,
      consommation: conso,
      observation: this.observation().trim(),
    });
    this.success.set({
      abonneId: e.abonneId,
      nom: e.nom,
      numeroAbonne: e.numeroAbonne,
      ancienIndex: e.ancienIndex,
      nouvelIndex: nouveauIndex,
      conso,
      ts: Date.now(),
    });
    this.toastSaved(e.nom);
    this.view.set('success');
  }

  // ── Succès (écran 09) ───────────────────────────────────────────────────────

  releverSuivant(): void {
    const next = this.prochain();
    if (next) {
      this.openSaisie(next);
    } else {
      this.backToList();
    }
  }

  // ── Feuille M-07 : non relevé / estimé ──────────────────────────────────────

  openM07(): void {
    this.m07Visible.set(true);
  }

  cancelM07(): void {
    this.m07Visible.set(false);
  }

  /** La sheet M-07 a validé un statut « non relevé / estimé » → mise en file + retour liste. */
  onM07Confirm(result: M07Result): void {
    const e = this.saisieEntry();
    const campagne = this.campagne();
    if (!e || !campagne) return;
    this.offline.enqueue({
      kind: result.statut,
      campagneId: campagne.campagneId,
      abonneId: e.abonneId,
      abonneNom: e.nom,
      nouveauIndex: null,
      consommation: null,
      observation: result.observation,
    });
    this.toastSaved(e.nom);
    this.m07Visible.set(false);
    this.backToList();
  }

  private toastSaved(nom: string): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant(
        this.offline.online() ? 'TERRAIN.TOAST_SAVED' : 'TERRAIN.TOAST_SAVED_OFFLINE',
      ),
      detail: nom,
    });
  }

  formatTime(ts: number): string {
    const lang = this.translate.currentLang() ?? 'fr';
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    const t = new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    // En français, la convention est « 09h05 » ; en anglais on garde « 09:05 ».
    return lang === 'fr' ? t.replace(':', 'h') : t;
  }
}
