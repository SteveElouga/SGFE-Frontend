import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { CampagnesService } from '../../core/campagnes/campagnes.service';
import { AuthService } from '../../core/auth/auth.service';
import { OfflineSaisieService, QueuedSaisie } from '../../core/terrain/offline-saisie.service';
import { Campagne, Releve } from '../../shared/models/campagne.model';
import { extractGqlError } from '../../core/auth/auth.service';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
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

/** Carte d'un abonné restant à relever. */
interface AReleverCard {
  abonneId: string;
  nom: string;
  initials: string;
  sub: string;
  ancienIndex: number;
}

/** Carte d'un relevé traité (en attente de sync ou synchronisé). */
interface DoneCard {
  key: string;
  abonneId: string;
  nom: string;
  initials: string;
  detail: string;
  synced: boolean;
  erreur?: string;
}

@Component({
  imports: [FormsModule, DecimalPipe, ToastModule, TranslatePipe, ErrorBannerComponent],
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

  // ── Feuille de saisie d'index ───────────────────────────────────────────────
  readonly saisieCarte = signal<AReleverCard | null>(null);
  readonly nouvelIndex = signal('');
  readonly submitting = signal(false);

  // ── Feuille M-07 : non relevé / estimé ──────────────────────────────────────
  readonly m07Visible = signal(false);
  readonly m07Statut = signal<'NON_RELEVE' | 'ESTIME'>('NON_RELEVE');
  readonly m07Observation = signal('');

  readonly agentNom = computed(() => this.auth.user()?.username ?? '');
  readonly agentInitial = computed(() => (this.agentNom()[0] ?? '?').toUpperCase());

  readonly campagneNom = computed(() => this.campagne()?.nom ?? '');

  private carteAbonne(abonneId: string): { nom: string; initials: string; info: AbonneInfo | undefined } {
    const info = this.abonnesMap().get(abonneId);
    const nom = info ? `${info.prenom} ${info.nom}`.trim() : abonneId;
    const initials = info
      ? `${info.prenom[0] ?? ''}${info.nom[0] ?? ''}`.toUpperCase()
      : '?';
    return { nom, initials, info };
  }

  private abonneSub(info: AbonneInfo | undefined): string {
    if (!info) return '';
    const parts: string[] = [];
    if (info.numeroCompteur != null) parts.push(`Compteur ${info.numeroCompteur}`);
    if (info.quartier) {
      const camp = info.camp != null ? `, Camp ${info.camp}` : '';
      parts.push(info.quartier + camp);
    }
    return parts.join(' · ');
  }

  private releveDetail(r: Releve): string {
    if (r.statut === 'ESTIME') return this.translate.instant('TERRAIN.ESTIME');
    if (r.statut === 'NON_RELEVE') return this.translate.instant('TERRAIN.NON_RELEVE');
    return this.translate.instant('TERRAIN.CARD_INDEX_SHORT', {
      index: r.nouveauIndex.toLocaleString('fr-FR'),
      conso: r.consommation,
    });
  }

  readonly aRelever = computed((): AReleverCard[] => {
    const submitted = this.offline.submittedAbonneIds();
    return this.releves()
      .filter((r) => r.statut === 'A_RELEVER' && !submitted.has(r.abonneId))
      .map((r) => {
        const { nom, initials, info } = this.carteAbonne(r.abonneId);
        return {
          abonneId: r.abonneId,
          nom,
          initials,
          sub: this.abonneSub(info),
          ancienIndex: r.ancienIndex,
        };
      });
  });

  private doneFromQueue(q: QueuedSaisie): DoneCard {
    const { nom, initials } = this.carteAbonne(q.abonneId);
    const time = this.formatTime(q.ts);
    let detail: string;
    if (q.kind === 'INDEX') {
      detail = this.translate.instant('TERRAIN.CARD_INDEX', {
        index: (q.nouveauIndex ?? 0).toLocaleString('fr-FR'),
        conso: q.consommation ?? 0,
        time,
      });
    } else {
      const statutLabel = this.translate.instant(
        q.kind === 'ESTIME' ? 'TERRAIN.ESTIME' : 'TERRAIN.NON_RELEVE',
      );
      detail = this.translate.instant('TERRAIN.CARD_STATUT', { statut: statutLabel, time });
    }
    return {
      key: q.id,
      abonneId: q.abonneId,
      nom: q.abonneNom || nom,
      initials,
      detail,
      synced: q.state === 'SYNCED',
      erreur: q.state === 'ERROR' ? q.erreur : undefined,
    };
  }

  readonly enAttente = computed((): DoneCard[] =>
    this.offline.pending().map((q) => this.doneFromQueue(q)),
  );

  readonly synchronises = computed((): DoneCard[] => {
    const submitted = this.offline.submittedAbonneIds();
    const fromQueue = this.offline.synced().map((q) => this.doneFromQueue(q));
    const fromServer = this.releves()
      .filter((r) => r.statut !== 'A_RELEVER' && !submitted.has(r.abonneId))
      .map((r): DoneCard => {
        const { nom, initials } = this.carteAbonne(r.abonneId);
        return {
          key: r.releveId,
          abonneId: r.abonneId,
          nom,
          initials,
          detail: this.releveDetail(r),
          synced: true,
        };
      });
    return [...fromQueue, ...fromServer];
  });

  // ── Saisie : consommation live + validation ────────────────────────────────
  readonly consoLive = computed((): number | null => {
    const carte = this.saisieCarte();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    if (!carte || Number.isNaN(idx)) return null;
    return idx - carte.ancienIndex;
  });

  readonly indexInvalide = computed(() => {
    const carte = this.saisieCarte();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    if (!carte || this.nouvelIndex().trim() === '' || Number.isNaN(idx)) return false;
    return idx < carte.ancienIndex;
  });

  readonly saisieValide = computed(() => {
    const carte = this.saisieCarte();
    const idx = Number.parseInt(this.nouvelIndex(), 10);
    return !!carte && !Number.isNaN(idx) && idx >= carte.ancienIndex;
  });

  readonly m07Valide = computed(() => this.m07Observation().trim().length > 0);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [campagnesRes, abonnesRes] = await Promise.all([
        firstValueFrom(
          this.apollo.query<{
            campagnes: Array<Campagne & { statut: string }>;
          }>({ query: GET_CAMPAGNES, fetchPolicy: 'network-only' }),
        ),
        firstValueFrom(
          this.apollo.query<{
            abonnes: Array<{
              id: string;
              numeroAbonne: string;
              nom: string;
              prenom: string;
              compteur?: { numeroCompteur: number; quartier: string; camp: number } | null;
            }>;
          }>({ query: GET_ABONNES, fetchPolicy: 'cache-first' }),
        ),
      ]);

      const map = new Map<string, AbonneInfo>();
      for (const a of abonnesRes.data?.abonnes ?? []) {
        map.set(a.id, {
          numeroAbonne: a.numeroAbonne,
          nom: a.nom,
          prenom: a.prenom,
          numeroCompteur: a.compteur?.numeroCompteur ?? null,
          quartier: a.compteur?.quartier ?? null,
          camp: a.compteur?.camp ?? null,
        });
      }
      this.abonnesMap.set(map);

      // Campagne active de l'agent : la plus récente EN_COURS.
      const campagnes = campagnesRes.data?.campagnes ?? [];
      const active =
        campagnes.find((c) => c.statut === 'EN_COURS') ??
        [...campagnes].sort((a, b) =>
          b.periodeAnnee !== a.periodeAnnee
            ? b.periodeAnnee - a.periodeAnnee
            : b.periodeMois - a.periodeMois,
        )[0] ?? null;
      this.campagne.set(active);

      if (active) {
        const releves = await this.campagnesService.getReleves(active.campagneId);
        this.releves.set(releves);
        // Purge des saisies locales déjà reflétées côté serveur.
        this.offline.clearSynced();
      }
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('TERRAIN.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Feuille de saisie ───────────────────────────────────────────────────────

  openSaisie(carte: AReleverCard): void {
    this.saisieCarte.set(carte);
    this.nouvelIndex.set('');
    this.m07Visible.set(false);
  }

  closeSaisie(): void {
    this.saisieCarte.set(null);
    this.m07Visible.set(false);
  }

  confirmSaisie(): void {
    const carte = this.saisieCarte();
    const campagne = this.campagne();
    if (!carte || !campagne || !this.saisieValide()) return;
    const nouveauIndex = Number.parseInt(this.nouvelIndex(), 10);
    this.offline.enqueue({
      kind: 'INDEX',
      campagneId: campagne.campagneId,
      abonneId: carte.abonneId,
      abonneNom: carte.nom,
      nouveauIndex,
      consommation: nouveauIndex - carte.ancienIndex,
      observation: '',
    });
    this.toastSaved(carte.nom);
    this.closeSaisie();
  }

  // ── Feuille M-07 : non relevé / estimé ──────────────────────────────────────

  openM07(): void {
    this.m07Statut.set('NON_RELEVE');
    this.m07Observation.set('');
    this.m07Visible.set(true);
  }

  setM07Statut(statut: 'NON_RELEVE' | 'ESTIME'): void {
    this.m07Statut.set(statut);
  }

  cancelM07(): void {
    this.m07Visible.set(false);
  }

  confirmM07(): void {
    const carte = this.saisieCarte();
    const campagne = this.campagne();
    if (!carte || !campagne || !this.m07Valide()) return;
    this.offline.enqueue({
      kind: this.m07Statut(),
      campagneId: campagne.campagneId,
      abonneId: carte.abonneId,
      abonneNom: carte.nom,
      nouveauIndex: null,
      consommation: null,
      observation: this.m07Observation().trim(),
    });
    this.toastSaved(carte.nom);
    this.closeSaisie();
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
