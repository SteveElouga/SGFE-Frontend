import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Envoi } from '../../shared/models/facture.model';
import { BadgeComponent, BadgeTone } from '../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import {
  FilterDefinition,
  FilterValues,
  FiltersPanelComponent,
} from '../../shared/components/filters-panel/filters-panel.component';
import { ToastService } from '../../shared/services/toast.service';
import { NotificationsService } from '../../core/notifications/notifications.service';

type StatutEnvoi = 'ENVOYE' | 'ECHEC' | 'EN_ATTENTE';

/**
 * Ligne d'envoi enrichie : l'envoi brut ne porte que des identifiants. Sans le
 * destinataire, ce journal ne répond pas à la seule question qu'on lui pose en
 * support — « à qui ce message est-il parti, et pourquoi a-t-il échoué ? ».
 */
interface EnvoiRow extends Envoi {
  destinataire: string;
  refAbonne: string;
  numeroFacture: string;
}

/** Regroupement par jour : 59 lignes plates ne se lisent pas. */
interface EnvoiGroupe {
  cle: string;
  libelle: string;
  lignes: EnvoiRow[];
}

/**
 * Écran Envois — historique global des messages WhatsApp (facture / relances /
 * suspension / rétablissement), avec renvoi des échecs. Alimenté par la query
 * `envois` sans filtre (ADMIN, COMPTABLE). Complète le journal par-facture.
 */
@Component({
  selector: 'app-envois-list',
  standalone: true,
  imports: [TranslatePipe, BadgeComponent, ErrorBannerComponent, PageTopbarComponent, FiltersPanelComponent],
  templateUrl: './envois-list.component.html',
  styleUrl: './envois-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvoisListComponent implements OnInit {
  private readonly service = inject(FacturesService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationsService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly envois = signal<Envoi[]>([]);
  readonly resending = signal<string | null>(null);
  readonly filtre = signal<'TOUS' | StatutEnvoi>('TOUS');

  /**
   * Le filtre, dans le panneau partagé plutôt qu'en liste déroulante nue.
   *
   * Cet écran était le dernier à fabriquer son propre filtre. Le dropdown n'avait
   * pas d'étiquette visible — un `ariaLabel` couvrait le lecteur d'écran, mais
   * quelqu'un qui regarde voyait une liste sans savoir ce qu'elle filtre.
   *
   * Les compteurs sont l'apport principal : le support vient ici pour trouver
   * des échecs, et il devait ouvrir le filtre pour découvrir s'il y en avait.
   * Le nombre se lit maintenant à côté de l'option.
   */
  readonly filtersConfig = computed((): FilterDefinition[] => {
    const lang = this.translate.currentLang() ?? undefined;
    const tous = this.envois();
    const compte = (s: StatutEnvoi) => tous.filter((e) => e.statut === s).length;
    return [
      {
        key: 'statut',
        label: 'ENVOIS.FILTRE_LABEL',
        options: [
          { label: this.translate.instant('ENVOIS.STATUT.ENVOYE', {}, lang), value: 'ENVOYE', count: compte('ENVOYE') },
          { label: this.translate.instant('ENVOIS.STATUT.ECHEC', {}, lang), value: 'ECHEC', count: compte('ECHEC') },
          { label: this.translate.instant('ENVOIS.STATUT.EN_ATTENTE', {}, lang), value: 'EN_ATTENTE', count: compte('EN_ATTENTE') },
        ],
      },
    ];
  });

  /** Valeurs courantes, au format du panneau partagé. */
  readonly filterValues = computed((): FilterValues => {
    const f = this.filtre();
    return f === 'TOUS' ? {} : { statut: f };
  });

  onFiltersChange(values: FilterValues): void {
    // Le panneau rend `null` quand on efface un filtre ; ici l'absence de
    // statut veut dire « tous », ce que le reste de l'écran attend.
    this.filtre.set((values['statut'] as StatutEnvoi | null) ?? 'TOUS');
  }

  /** factureId → libellés enrichis portés par la facture. */
  private readonly facturesIndex = signal<Map<string, { numeroFacture: string; nom: string; numero: string }>>(
    new Map(),
  );
  /** abonneId → libellés, pour les envois sans facture (suspension, rétablissement). */
  private readonly abonnesIndex = signal<Map<string, { nom: string; numero: string }>>(new Map());

  readonly rows = computed((): EnvoiRow[] => {
    const f = this.filtre();
    const parFacture = this.facturesIndex();
    const parAbonne = this.abonnesIndex();
    const list = f === 'TOUS' ? this.envois() : this.envois().filter((e) => e.statut === f);

    return list.map((e) => {
      const viaFacture = e.factureId ? parFacture.get(e.factureId) : undefined;
      const viaAbonne = e.abonneId ? parAbonne.get(e.abonneId) : undefined;
      const nom = viaFacture?.nom || viaAbonne?.nom || '';
      const numero = viaFacture?.numero || viaAbonne?.numero || '';
      return {
        ...e,
        destinataire: nom || numero || this.translate.instant('ENVOIS.DESTINATAIRE_INCONNU'),
        refAbonne: nom ? numero : '',
        numeroFacture: viaFacture?.numeroFacture ?? '',
      };
    });
  });

  /**
   * Pagination (interne, cliente — même motif que `<app-data-table>`, voir
   * son `data-table.component.ts`). L'écran ne l'utilisait pas : il rendait
   * les 155 envois d'un coup, un seul long défilement sans repère de
   * position ni moyen d'atteindre directement le bas du journal.
   */
  private readonly pageSize = 30;
  private readonly page = signal(0);
  readonly total = computed(() => this.rows().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  /** Page bornée : protège d'un débordement après filtrage. */
  readonly safePage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : this.safePage() * this.pageSize + 1));
  readonly rangeEnd = computed(() => Math.min((this.safePage() + 1) * this.pageSize, this.total()));
  /** Fenêtre de numéros de page (max 5). */
  readonly visiblePages = computed(() => {
    const count = this.pageCount();
    const cur = this.safePage();
    const MAX = 5;
    if (count <= MAX) return Array.from({ length: count }, (_, i) => i);
    let start = Math.max(0, cur - 2);
    const end = Math.min(count - 1, start + MAX - 1);
    start = Math.max(0, end - MAX + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  private readonly pagedRows = computed(() => {
    const start = this.safePage() * this.pageSize;
    return this.rows().slice(start, start + this.pageSize);
  });

  /** Lignes de la page courante, groupées par jour du plus récent au plus ancien. */
  readonly groupes = computed((): EnvoiGroupe[] => {
    const out: EnvoiGroupe[] = [];
    let courant: EnvoiGroupe | null = null;
    for (const l of this.pagedRows()) {
      const cle = (l.dateEnvoi ?? '').slice(0, 10);
      if (!courant || courant.cle !== cle) {
        courant = { cle, libelle: this.libelleJour(cle), lignes: [] };
        out.push(courant);
      }
      courant.lignes.push(l);
    }
    return out;
  });

  goPage(target: number): void {
    if (target >= 0 && target < this.pageCount()) this.page.set(target);
  }

  constructor() {
    // Retour en page 1 dès que le jeu de lignes change (filtre / rechargement).
    effect(() => {
      this.rows();
      untracked(() => this.page.set(0));
    });
  }

  /** Nombre d'échecs affichés — ce que le support cherche en premier. */
  readonly nbEchecs = computed(() => this.rows().filter((e) => e.statut === 'ECHEC').length);

  private libelleJour(iso: string): string {
    if (!iso) return '—';
    const jour = new Date(iso + 'T00:00:00');
    const auj = new Date();
    const hier = new Date(auj.getTime() - 86_400_000);
    const meme = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (meme(jour, auj)) return this.translate.instant('ENVOIS.AUJOURDHUI');
    if (meme(jour, hier)) return this.translate.instant('ENVOIS.HIER');
    return jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Les factures portent déjà les libellés d'abonné : une requête suffit
      // pour rendre tout le journal lisible. Un échec de leur chargement ne
      // doit pas priver l'écran de sa liste d'envois.
      const [envoisRes, facturesRes] = await Promise.allSettled([
        this.service.getAllEnvois(),
        this.service.getFactures(),
      ]);
      if (envoisRes.status === 'rejected') throw envoisRes.reason;

      const factures = facturesRes.status === 'fulfilled' ? facturesRes.value : [];
      const parFacture = new Map<string, { numeroFacture: string; nom: string; numero: string }>();
      const parAbonne = new Map<string, { nom: string; numero: string }>();
      for (const f of factures) {
        const nom = (f.abonneNom ?? '').trim();
        const numero = (f.abonneNumero ?? '').trim();
        parFacture.set(f.factureId, { numeroFacture: f.numeroFacture, nom, numero });
        if (f.abonneId && (nom || numero)) parAbonne.set(f.abonneId, { nom, numero });
      }
      this.facturesIndex.set(parFacture);
      this.abonnesIndex.set(parAbonne);

      this.envois.set(
        [...envoisRes.value].sort((a, b) => (b.dateEnvoi ?? '').localeCompare(a.dateEnvoi ?? '')),
      );
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('ENVOIS.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }

  async renvoyer(e: Envoi): Promise<void> {
    if (this.resending()) return;
    this.resending.set(e.envoiId);
    try {
      await this.service.renvoyerEnvoi(e.envoiId);
      this.toast.success(this.translate.instant('ENVOIS.RESEND_OK'));
      await this.load();
      void this.notifications.refresh();   // l'alerte d'échec n'a plus lieu d'être
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.toast.error(message || this.translate.instant('ERRORS.GENERIC'));
    } finally {
      this.resending.set(null);
    }
  }

  statutTone(statut: string): BadgeTone {
    if (statut === 'ENVOYE') return 'success';
    if (statut === 'ECHEC') return 'danger';
    return 'warning';
  }

  /** Libellé traduit d'un type d'envoi, avec repli sur la valeur brute. */
  typeLabel(t: string | undefined): string {
    const raw = t || 'FACTURE';
    const key = 'ENVOIS.TYPE.' + raw;
    const label = this.translate.instant(key);
    return label === key ? raw : label;
  }

  /** Heure seule : la date est déjà portée par l'intertitre du jour. */
  formatHeure(d: string): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return d;
    }
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  }
}
