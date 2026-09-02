import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  afterRenderEffect,
  computed,
  contentChild,
  contentChildren,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DataTableCardDirective, DataTableCellDirective } from './data-table.directives';
import { SkeletonComponent } from '../skeleton/skeleton.component';

/** Définition d'une colonne : structure + en-tête customisable par écran. */
export interface DataTableColumn {
  /** Champ de la ligne (et clé de rattachement d'un template `appCol`). */
  key: string;
  /** Clé i18n de l'en-tête. */
  header: string;
  /** Alignement du contenu (défaut : left). */
  align?: 'left' | 'right' | 'center';
  /** Largeur CSS optionnelle (ex : '120px', '20%'). */
  width?: string;
  /** Classe(s) CSS additionnelle(s) sur le `<th>`. */
  headerClass?: string;
  /** Classe(s) CSS additionnelle(s) sur le `<td>`. */
  cellClass?: string;
  /**
   * Colonne triable : ajoute un bouton d'en-tête cliquable qui cycle
   * `asc → desc → non trié`. Le tri s'applique sur `sortValue(row)` ou, à
   * défaut, sur `row[key]`. Non compatible avec `actions` (colonne d'actions).
   */
  sortable?: boolean;
  /**
   * Extracteur de valeur triable, pour les colonnes dérivées (ex : nom+prénom
   * concaténés, date à parser). Retourner `null` = valeur en fin de tri.
   */
  sortValue?: (row: unknown) => string | number | Date | null | undefined;
}

export type SortDirection = 'asc' | 'desc';
export interface SortState { key: string; direction: SortDirection; }

/**
 * Tableau partagé du projet (rendu `<table>` maison, striping, états
 * loading/empty, pagination conditionnelle intégrée + liste de cartes mobile).
 *
 * Reçoit des données **déjà filtrées** (`rows`) — il n'exécute aucune logique
 * métier : il affiche et pagine. Customisation :
 *  - `columns` (inputs) pour les en-têtes / alignements ;
 *  - templates `appCol="<key>"` pour les cellules riches (badges, boutons…) ;
 *  - template `appCardRow` pour la carte mobile.
 */
@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, SkeletonComponent],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T = unknown> {
  // ── Inputs ──────────────────────────────────────────────────────────────
  readonly columns = input.required<readonly DataTableColumn[]>();
  readonly rows = input.required<readonly T[]>();
  readonly loading = input(false);
  /** Taille de page (0 = pas de pagination). */
  readonly pageSize = input(5);
  /** Champ identifiant de ligne (pour `@for track`). */
  readonly trackKey = input('id');
  /** Alternance de fond (zebra) une ligne sur deux. */
  readonly striped = input(false);
  /** Clé i18n du message d'état vide. */
  readonly emptyMessage = input('COMMON.NO_DATA');
  /** Clé i18n du libellé de pagination (params : start/end/total). */
  readonly pageInfoKey = input('COMMON.PAGINATION_INFO');
  /** Lignes cliquables : booléen global ou prédicat par ligne (émet `rowClick`). */
  readonly rowClickable = input<boolean | ((row: T) => boolean)>(false);

  /**
   * URL de destination d'une ligne. Fournie, elle transforme la première
   * cellule en `<a routerLink>` : la ligne redevient adressable (clic-milieu,
   * nouvel onglet, copie du lien), ce qu'un gestionnaire de clic seul empêche.
   */
  readonly rowLink = input<((row: T) => string | unknown[] | null) | null>(null);
  /** Classe(s) CSS conditionnelle(s) par ligne (ex : `dt__row--selected`). */
  readonly rowClass = input<((row: T) => string | string[] | null) | null>(null);

  readonly rowClick = output<T>();
  /** Émis quand l'utilisateur change le tri via un en-tête cliquable. */
  readonly sortChange = output<SortState | null>();

  // ── Débordement : dire qu'il reste des lignes en dessous ────────────────
  /**
   * Le tableau défile à l'intérieur de sa zone depuis que la pagination doit
   * rester à l'écran. Sur une fenêtre de 900 px, cette zone montre **onze
   * lignes et demie** — mesuré : 826 px de hauteur visible pour 1 098 px de
   * contenu sur quinze lignes. Rien ne le disait.
   *
   * Le pied annonçait « 1–15 sur 19 » pendant que l'écran en montrait douze :
   * l'utilisateur a compté douze abonnés sur dix-neuf et conclu qu'il en
   * manquait sept. Ni le total ni la pagination n'étaient faux — c'est la
   * coupe qui était invisible.
   *
   * Ces deux signaux la rendent visible. Ils sont pilotés par l'événement de
   * défilement plutôt que par une règle CSS : les ombres de défilement en CSS
   * pur (`background-attachment: local`) se peignent sur le fond du conteneur,
   * que les lignes opaques du tableau recouvrent entièrement.
   */
  readonly resteEnDessous = signal(false);
  readonly resteAuDessus = signal(false);

  /**
   * La zone défilante, pour la mesurer avant tout défilement.
   *
   * Sans cette mesure initiale, le voile n'apparaîtrait qu'après que
   * l'utilisateur a défilé — c'est-à-dire après qu'il a découvert tout seul ce
   * que le voile est censé lui apprendre.
   */
  private readonly zoneDefilante = viewChild<ElementRef<HTMLElement>>('zone');

  /** Recalcule les deux signaux depuis la position réelle de la zone. */
  jaugerDebordement(zone: HTMLElement): void {
    // La tolérance d'un pixel évite un scintillement en fin de course : la
    // hauteur de défilement d'un tableau tombe rarement sur un entier.
    const restant = zone.scrollHeight - zone.clientHeight - zone.scrollTop;
    this.resteEnDessous.set(restant > 1);
    this.resteAuDessus.set(zone.scrollTop > 1);
  }

  // ── Templates projetés ──────────────────────────────────────────────────
  private readonly router = inject(Router);

  private readonly cellDirectives = contentChildren(DataTableCellDirective);
  private readonly cardDirective = contentChild(DataTableCardDirective);

  private readonly cellTemplates = computed(() => {
    const map = new Map<string, TemplateRef<unknown>>();
    for (const dir of this.cellDirectives()) map.set(dir.appCol(), dir.template);
    return map;
  });
  readonly cardTemplate = computed(() => this.cardDirective()?.template ?? null);

  /**
   * Rangées fictives de l'état chargement — un nombre fixe plutôt qu'indexé
   * sur `pageSize()` : ce dernier peut valoir 0 (pagination désactivée) ou un
   * nombre arbitrairement grand, ni l'un ni l'autre n'étant une bonne mesure
   * de la hauteur qu'un état de chargement doit occuper.
   */
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  // ── Tri (interne, client) ──────────────────────────────────────────────
  readonly sortState = signal<SortState | null>(null);
  /**
   * Lignes triées d'après `sortState` (si actif). Le tri est stable, tri
   * numérique quand la valeur est un nombre, sinon `localeCompare` pour les
   * chaînes. Les `null`/`undefined` finissent toujours en queue quel que soit
   * la direction.
   */
  readonly sortedRows = computed<readonly T[]>(() => {
    const state = this.sortState();
    const rows = this.rows();
    if (!state) return rows;
    const col = this.columns().find((c) => c.key === state.key);
    if (!col?.sortable) return rows;
    const extract = col.sortValue ?? ((row: unknown) => (row as Record<string, unknown>)?.[state.key]);
    const dir = state.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = extract(a) as string | number | Date | null | undefined;
      const vb = extract(b) as string | number | Date | null | undefined;
      // null/undefined toujours en queue
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir;
      return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' }) * dir;
    });
  });

  // ── Pagination (interne, cliente) ───────────────────────────────────────
  private readonly page = signal(0);
  readonly pageCount = computed(() => {
    const size = this.pageSize();
    return size > 0 ? Math.max(1, Math.ceil(this.sortedRows().length / size)) : 1;
  });
  /** Page bornée : protège d'un débordement après filtrage. */
  readonly safePage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly pagedRows = computed(() => {
    const size = this.pageSize();
    if (size <= 0) return this.sortedRows();
    const start = this.safePage() * size;
    return this.sortedRows().slice(start, start + size);
  });
  readonly total = computed(() => this.sortedRows().length);
  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : this.safePage() * this.pageSize() + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min((this.safePage() + 1) * this.pageSize(), this.total()),
  );
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

  constructor() {
    // Retour en page 1 dès que le jeu de données change (filtre / rechargement).
    effect(() => {
      this.rows();
      untracked(() => this.page.set(0));
    });

    // Après chaque rendu qui change les lignes affichées : la hauteur du contenu
    // vient de bouger, et avec elle la réponse à « reste-t-il quelque chose en
    // dessous ? ». Les deux `set` sont sans effet quand la valeur ne change pas,
    // donc ce rendu-ci ne peut pas en déclencher un autre indéfiniment.
    afterRenderEffect(() => {
      this.pagedRows();
      const zone = this.zoneDefilante()?.nativeElement;
      if (zone) this.jaugerDebordement(zone);
    });
  }

  goPage(target: number): void {
    if (target >= 0 && target < this.pageCount()) this.page.set(target);
  }

  cellTemplate(key: string): TemplateRef<unknown> | null {
    return this.cellTemplates().get(key) ?? null;
  }

  cellValue(row: T, key: string): unknown {
    return (row as Record<string, unknown>)?.[key];
  }

  rowKey(row: T): unknown {
    return (row as Record<string, unknown>)?.[this.trackKey()];
  }

  /** URL de la ligne, ou `null` si l'écran n'en fournit pas. */
  linkOf(row: T): string | unknown[] | null {
    const fn = this.rowLink();
    return fn ? fn(row) : null;
  }

  /**
   * Une ligne qui mène quelque part se comporte comme telle.
   *
   * `rowLink` posait un vrai lien sur la première cellule — bon choix : il
   * préserve le clic-milieu, l'ouverture dans un onglet et la copie de l'URL,
   * qu'un gestionnaire de clic seul détruit. Mais ce lien était le seul chemin
   * vers la fiche, et il ne se voyait pas : couleur héritée, soulignement
   * uniquement au survol, donc rien du tout sur un écran tactile.
   *
   * Le reste de la ligne n'était pas cliquable pour autant — quatre écrans sur
   * cinq ne déclaraient pas `rowClickable`. Résultat : une cible de la taille
   * d'un numéro de facture, sans indice qu'elle en est une.
   *
   * Fournir `rowLink` suffit maintenant à rendre la ligne navigable. Un écran
   * peut toujours passer `rowClickable` explicitement pour restreindre le
   * comportement à certaines lignes.
   */
  isRowClickable(row: T): boolean {
    const rc = this.rowClickable();
    if (typeof rc === 'function') return rc(row);
    return rc || this.linkOf(row) !== null;
  }

  rowClasses(row: T): string | string[] | null {
    return this.rowClass()?.(row) ?? null;
  }

  /**
   * Navigue, sauf si le clic visait déjà quelque chose.
   *
   * Les colonnes d'actions portent leurs propres liens et boutons ; sans ce
   * garde-fou, cliquer « Modifier » ouvrirait la fiche en lecture au lieu du
   * formulaire. On laisse donc passer tout clic né à l'intérieur d'un élément
   * interactif — c'est lui qui sait ce qu'il fait.
   */
  onRowClick(row: T, event?: Event): void {
    if (!this.isRowClickable(row)) return;
    const cible = event?.target as HTMLElement | null;
    if (cible?.closest('a, button, input, select, textarea, [role="button"]')) return;

    const href = this.linkOf(row);
    if (href !== null) {
      void this.router.navigate(Array.isArray(href) ? href : [href]);
    }
    this.rowClick.emit(row);
  }

  /**
   * Cycle de tri sur clic d'en-tête : `off → asc → desc → off`. Passer d'une
   * colonne à une autre repart en `asc`. Émet `sortChange` pour les parents
   * qui veulent contrôler ou logger.
   */
  toggleSort(key: string): void {
    const col = this.columns().find((c) => c.key === key);
    if (!col?.sortable) return;
    const current = this.sortState();
    let next: SortState | null;
    if (!current || current.key !== key) {
      next = { key, direction: 'asc' };
    } else if (current.direction === 'asc') {
      next = { key, direction: 'desc' };
    } else {
      next = null;
    }
    this.sortState.set(next);
    this.sortChange.emit(next);
  }

  /** Retourne la direction courante d'une colonne (`null` si non triée). */
  sortDirectionOf(key: string): SortDirection | null {
    const s = this.sortState();
    return s && s.key === key ? s.direction : null;
  }
}
