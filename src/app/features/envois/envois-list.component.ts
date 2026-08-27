import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { FacturesService } from '../../core/factures/factures.service';
import { extractGqlError } from '../../core/auth/auth.service';
import { Envoi } from '../../shared/models/facture.model';
import { BadgeComponent, BadgeTone } from '../../shared/components/badge/badge.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
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
  imports: [FormsModule, SelectModule, TranslatePipe, BadgeComponent, ErrorBannerComponent, PageTopbarComponent],
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

  readonly filtreOptions = computed((): Array<{ label: string; value: 'TOUS' | StatutEnvoi }> => {
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('ENVOIS.FILTRE_TOUS', {}, lang), value: 'TOUS' },
      { label: this.translate.instant('ENVOIS.STATUT.ENVOYE', {}, lang), value: 'ENVOYE' },
      { label: this.translate.instant('ENVOIS.STATUT.ECHEC', {}, lang), value: 'ECHEC' },
      { label: this.translate.instant('ENVOIS.STATUT.EN_ATTENTE', {}, lang), value: 'EN_ATTENTE' },
    ];
  });

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

  /** Lignes groupées par jour, du plus récent au plus ancien. */
  readonly groupes = computed((): EnvoiGroupe[] => {
    const out: EnvoiGroupe[] = [];
    let courant: EnvoiGroupe | null = null;
    for (const l of this.rows()) {
      const cle = (l.dateEnvoi ?? '').slice(0, 10);
      if (!courant || courant.cle !== cle) {
        courant = { cle, libelle: this.libelleJour(cle), lignes: [] };
        out.push(courant);
      }
      courant.lignes.push(l);
    }
    return out;
  });

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
