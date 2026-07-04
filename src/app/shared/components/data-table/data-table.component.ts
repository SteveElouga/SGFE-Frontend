import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DataTableCardDirective, DataTableCellDirective } from './data-table.directives';

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
}

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
  imports: [NgTemplateOutlet, TranslatePipe],
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
  /** Clé i18n du message d'état vide. */
  readonly emptyMessage = input('COMMON.NO_DATA');
  /** Clé i18n du libellé de pagination (params : start/end/total). */
  readonly pageInfoKey = input('COMMON.PAGINATION_INFO');
  /** Lignes cliquables : booléen global ou prédicat par ligne (émet `rowClick`). */
  readonly rowClickable = input<boolean | ((row: T) => boolean)>(false);
  /** Classe(s) CSS conditionnelle(s) par ligne (ex : `dt__row--selected`). */
  readonly rowClass = input<((row: T) => string | string[] | null) | null>(null);

  readonly rowClick = output<T>();

  // ── Templates projetés ──────────────────────────────────────────────────
  private readonly cellDirectives = contentChildren(DataTableCellDirective);
  private readonly cardDirective = contentChild(DataTableCardDirective);

  private readonly cellTemplates = computed(() => {
    const map = new Map<string, TemplateRef<unknown>>();
    for (const dir of this.cellDirectives()) map.set(dir.appCol(), dir.template);
    return map;
  });
  readonly cardTemplate = computed(() => this.cardDirective()?.template ?? null);

  // ── Pagination (interne, cliente) ───────────────────────────────────────
  private readonly page = signal(0);
  readonly pageCount = computed(() => {
    const size = this.pageSize();
    return size > 0 ? Math.max(1, Math.ceil(this.rows().length / size)) : 1;
  });
  /** Page bornée : protège d'un débordement après filtrage. */
  readonly safePage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly pagedRows = computed(() => {
    const size = this.pageSize();
    if (size <= 0) return this.rows();
    const start = this.safePage() * size;
    return this.rows().slice(start, start + size);
  });
  readonly total = computed(() => this.rows().length);
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

  isRowClickable(row: T): boolean {
    const rc = this.rowClickable();
    return typeof rc === 'function' ? rc(row) : rc;
  }

  rowClasses(row: T): string | string[] | null {
    return this.rowClass()?.(row) ?? null;
  }

  onRowClick(row: T): void {
    if (this.isRowClickable(row)) this.rowClick.emit(row);
  }
}
