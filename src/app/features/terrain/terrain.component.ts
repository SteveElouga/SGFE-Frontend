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
import { M07SheetComponent, M07Result } from './m07-sheet/m07-sheet.component';
import { GET_ABONNES } from '../../graphql/queries/abonnes.queries';
import { GET_CAMPAGNES } from '../../graphql/queries/campagnes.queries';

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
  nom: string;
  numeroAbonne: string;
  ancienIndex: number;
  nouvelIndex: number;
  conso: number;
  ts: number;
}

@Component({
  imports: [FormsModule, DecimalPipe, LowerCasePipe, ToastModule, TranslatePipe, ErrorBannerComponent, M07SheetComponent],
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
  readonly abonnesMap = signal<Map<string, AbonneInfo>>(new Map());

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

  private carteAbonne(abonneId: string): { nom: string; info: AbonneInfo | undefined } {
    const info = this.abonnesMap().get(abonneId);
    const nom = info ? `${info.prenom} ${info.nom}`.trim() : abonneId;
    return { nom, info };
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
      const { nom, info } = this.carteAbonne(r.abonneId);
      const base = {
        abonneId: r.abonneId,
        nom,
        sub: this.localisation(info),
        ancienIndex: r.ancienIndex,
        numeroAbonne: info?.numeroAbonne ?? '',
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

  readonly progressPct = computed(() => {
    const total = this.countTous();
    if (total === 0) return 0;
    return Math.round(((total - this.countARelever()) / total) * 100);
  });
  readonly nbFaits = computed(() => this.countTous() - this.countARelever());

  // ── Saisie : consommation live + validation (RV-001) ────────────────────────
  readonly consoLive = computed((): number | null => {
    const e = this.saisieEntry();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    if (!e || Number.isNaN(idx)) return null;
    return idx - e.ancienIndex;
  });

  readonly indexInvalide = computed(() => {
    const e = this.saisieEntry();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    if (!e || this.nouvelIndex().trim() === '' || Number.isNaN(idx)) return false;
    return idx < e.ancienIndex;
  });

  readonly saisieValide = computed(() => {
    const e = this.saisieEntry();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    return !!e && !Number.isNaN(idx) && idx >= e.ancienIndex;
  });

  /** Prochain abonné à relever (hors abonné courant), pour l'écran de succès. */
  readonly prochain = computed((): Entry | null => {
    const currentId = this.success()?.numeroAbonne;
    return this.entries().find((e) => e.status === 'A_RELEVER' && e.numeroAbonne !== currentId) ?? null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // `abonnes` est réservé ADMIN côté backend (ANO-015) : un AGENT authentifié
      // reçoit PERMISSION_DENIED. On isole cet appel pour qu'un refus ne fasse
      // pas échouer tout le chargement — l'agent doit voir ses relevés même sans
      // les noms/quartiers (repli sur l'ID abonné, géré par carteAbonne()).
      const [campagnesRes, abonnesMap] = await Promise.all([
        firstValueFrom(
          this.apollo.query<{ campagnes: Array<Campagne & { statut: string }> }>({
            query: GET_CAMPAGNES,
            fetchPolicy: 'network-only',
          }),
        ),
        this.loadAbonnesMap(),
      ]);
      this.abonnesMap.set(abonnesMap);

      const campagnes = campagnesRes.data?.campagnes ?? [];
      const active =
        campagnes.find((c) => c.statut === 'EN_COURS') ??
        [...campagnes].sort((a, b) =>
          b.periodeAnnee !== a.periodeAnnee
            ? b.periodeAnnee - a.periodeAnnee
            : b.periodeMois - a.periodeMois,
        )[0] ??
        null;
      this.campagne.set(active);

      if (active) {
        const releves = await this.campagnesService.getReleves(active.campagneId);
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

  private async loadAbonnesMap(): Promise<Map<string, AbonneInfo>> {
    try {
      const res = await firstValueFrom(
        this.apollo.query<{
          abonnes: Array<{
            id: string;
            numeroAbonne: string;
            nom: string;
            prenom: string;
            compteur?: { numeroCompteur: number; quartier: string; camp: number } | null;
          }>;
        }>({ query: GET_ABONNES, fetchPolicy: 'cache-first', context: { silentError: true } }),
      );
      const map = new Map<string, AbonneInfo>();
      for (const a of res.data?.abonnes ?? []) {
        map.set(a.id, {
          numeroAbonne: a.numeroAbonne,
          nom: a.nom,
          prenom: a.prenom,
          numeroCompteur: a.compteur?.numeroCompteur ?? null,
          quartier: a.compteur?.quartier ?? null,
          camp: a.compteur?.camp ?? null,
        });
      }
      return map;
    } catch {
      // Rôle sans accès à `abonnes` (AGENT) : la liste reste utilisable, dégradée.
      return new Map();
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
    const nouveauIndex = Number.parseInt(this.nouvelIndex(), 10);
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
    return new Date(ts)
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', 'h');
  }
}
