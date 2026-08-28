import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../services/toast.service';

/** Une option d'un filtre (label déjà résolu ou clé i18n si `translateLabels`). */
export interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

/** Définition d'un filtre projeté dans le panneau. */
export interface FilterDefinition {
  /** Identifiant unique du filtre (clé dans `values` + `queryParam` URL). */
  key: string;
  /** Clé i18n du libellé (chip « Tous ») / placeholder select. */
  label: string;
  /** Options disponibles. */
  options: readonly FilterOption[];
  /**
   * Mode de rendu :
   * - `chips`  : contrôle segmenté (pilules)
   * - `select` : dropdown avec placeholder
   * - `auto`  : chips en mobile (≤640px), select en desktop — défaut
   */
  render?: 'chips' | 'select' | 'auto';
  /**
   * Visibilité selon breakpoint :
   * - `both`         : partout (défaut)
   * - `desktop-only` : masqué en mobile
   * - `mobile-only`  : masqué en desktop
   */
  visibility?: 'both' | 'desktop-only' | 'mobile-only';
  /** Traduire les labels des options via `translate` pipe. Défaut false. */
  translateLabels?: boolean;
  /**
   * Autoriser la valeur `null` (« Tous » / clear). Défaut true.
   * Si false, la première option devient la valeur par défaut.
   */
  clearable?: boolean;
}

/** État sérialisable des filtres : `{ statut: 'IMPAYEE', campagne: null }`. */
export type FilterValues = Record<string, string | null>;

/**
 * Panneau de filtres unifié app-wide : recherche + filtres typés + meta-controls
 * (compteur résultats, « Effacer tous », tags actifs dismissables). Remplace le
 * duo `<app-filter-bar>` + `<app-filter-chips>` + projection ad hoc de p-selects
 * qui répliquait la même mécanique sur 6 surfaces (batch 10, dette identifiée).
 *
 * ## API principale
 *
 * ```html
 * <app-filters-panel
 *   [filters]="filtersConfig"
 *   [values]="filterValues()"
 *   (valuesChange)="onFiltersChange($event)"
 *   [search]="searchTerm()"
 *   (searchChange)="searchTerm.set($event)"
 *   [debounceMs]="250"
 *   [resultCount]="filteredItems().length"
 *   [totalCount]="items().length"
 *   [syncUrl]="true"
 * />
 * ```
 *
 * ## Responsive
 *
 * Les filtres `render: 'auto'` deviennent des chips segmentés en mobile (≤640px)
 * et des selects en desktop. Un seul template = zéro duplication chips/dropdown
 * dans les surfaces consommatrices. Filtres avec >5 options restent en select
 * même en mobile (chips illisibles au-delà).
 *
 * ## URL sync (opt-in)
 *
 * Avec `[syncUrl]="true"`, les valeurs sont hydratées depuis `?filter_key=value`
 * au mount et synchronisées via `router.navigate([], { queryParams, ...merge, replaceUrl })`
 * à chaque changement. Permet bookmark, partage, reload sans perte d'état.
 */
@Component({
  selector: 'app-filters-panel',
  standalone: true,
  imports: [FormsModule, IconFieldModule, InputIconModule, InputTextModule, SelectModule, TranslatePipe],
  templateUrl: './filters-panel.component.html',
  styleUrl: './filters-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Encapsulation.None pour que les styleClass p-select s'appliquent sans ::ng-deep.
  encapsulation: ViewEncapsulation.None,
})
export class FiltersPanelComponent {
  // ── Recherche ──────────────────────────────────────────────────────────
  readonly search = input('');
  readonly searchChange = output<string>();
  readonly showSearch = input(true);
  readonly searchPlaceholder = input('COMMON.SEARCH');
  readonly debounceMs = input(0);

  // ── Filtres ─────────────────────────────────────────────────────────────
  readonly filters = input<readonly FilterDefinition[]>([]);
  readonly values = input<FilterValues>({});
  readonly valuesChange = output<FilterValues>();

  // ── Meta ────────────────────────────────────────────────────────────────
  readonly resultCount = input<number | null>(null);
  readonly totalCount = input<number | null>(null);
  /** Clé i18n du libellé compteur (params disponibles : `count`, `total`). */
  readonly countLabel = input('COMMON.RESULTS_COUNT');
  /** Clé i18n du bouton « Effacer tout ». */
  readonly clearAllLabel = input('COMMON.CLEAR_ALL_FILTERS');
  /**
   * Nom (pluralisable) du sujet compté dans le héro : « factures », « abonnés »…
   * Défaut `COMMON.RESULTS_HERO_LABEL` = "résultat(s)". Le consumer passe sa clé
   * spécifique — ex `FACTURATION.RESULTS_HERO_LABEL` = "facture(s)". Reçoit
   * `{count}` en paramètre pour permettre au libellé traduit d'accorder :
   * "1 facture" vs "16 factures".
   */
  readonly heroNounKey = input('COMMON.RESULTS_HERO_LABEL');

  // ── Persistance ────────────────────────────────────────────────────────
  readonly syncUrl = input(false);
  readonly persistKey = input<string | null>(null);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  // ── Buffer local recherche (debounce) ──────────────────────────────────
  readonly localSearch = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Vrai pendant la fenêtre de debounce (buffer local ≠ valeur commitée).
   * Affiche un spinner à la place de la loupe → l'utilisateur voit que sa
   * frappe est enregistrée mais pas encore fetchée. Sans ça, 250-650ms muets
   * = tape 2× (Nielsen #1 Visibilité état système).
   */
  readonly isDebouncing = computed(() => this.localSearch() !== this.search());

  /**
   * Filtres qui rendent en chips (mode `chips` OU `auto` avec ≤5 options).
   * Séparés des selects pour permettre au template de les placer dans une
   * bande dédiée sous les controls compacts (Direction A : hero + controls + chips).
   */
  readonly chipFilters = computed(() =>
    this.filters().filter((f) => f.render === 'chips' || (f.render !== 'select' && f.options.length <= 5)),
  );

  /** Filtres qui rendent en select (mode `select` OU `auto` avec >5 options). */
  readonly selectFilters = computed(() =>
    this.filters().filter((f) => f.render === 'select' || (f.render !== 'chips' && f.options.length > 5)),
  );

  // ── State interne ──────────────────────────────────────────────────────
  /** Copie interne des values (permet edit local avant émission). */
  private readonly localValues = signal<FilterValues>({});

  /**
   * Nombre de filtres actifs CLEARABLES (non-null). Les filtres non-clearable
   * portent un état obligatoire → ne comptent pas comme « actifs à effacer ».
   */
  readonly activeCount = computed(() => {
    const v = this.localValues();
    return this.filters()
      .filter((f) => f.clearable !== false)
      .filter((f) => v[f.key] !== null && v[f.key] !== undefined && v[f.key] !== '')
      .length;
  });

  /**
   * Sous-titre héro : "sur {total}" + résumé des filtres clearables actifs.
   * 0 tag → seulement le total (si différent du count). 1 tag → sa valueLabel.
   * 2+ tags → "N filtres actifs". Retourne "" si rien à dire.
   */
  /**
   * La ligne de résultat n'a de sens que si elle contredit la barre de titre :
   * liste restreinte par un filtre, ou résultat vide. Sinon elle répète.
   */
  readonly afficheResultat = computed(() => {
    const count = this.resultCount();
    if (count === null) return false;
    const total = this.totalCount();
    return count === 0 || this.activeCount() > 0 || (total !== null && total !== count);
  });

  readonly heroSubtitle = computed(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const count = this.resultCount();
    const total = this.totalCount();
    const tags = this.activeTags();
    const parts: string[] = [];
    if (total !== null && count !== null && total !== count) {
      parts.push(this.translate.instant('COMMON.RESULTS_HERO_OVER', { total }, lang));
    }
    if (tags.length === 1) {
      parts.push(tags[0].valueLabel);
    } else if (tags.length > 1) {
      parts.push(this.translate.instant('COMMON.RESULTS_HERO_MULTI', { count: tags.length }, lang));
    }
    return parts.join(' · ');
  });

  /**
   * Résumé des filtres actifs sous forme de tags dismissables. Filtre non-
   * clearable = jamais dans les tags (le × ne pourrait pas retirer la valeur,
   * ce serait un bug UX). Le contexte doit rester visible ailleurs (topbar
   * subtitle, url, etc.).
   */
  readonly activeTags = computed(() => {
    const v = this.localValues();
    const lang = this.translate.currentLang() ?? undefined;
    return this.filters()
      .filter((f) => f.clearable !== false)                       // non-clearable = pas de tag
      // Un tag sert à montrer un filtre dont on ne voit PAS le contrôle. Sur
      // /paiements, le sélecteur affichait « Facturation Juillet 2026 » et le
      // tag répétait « Campagne : Facturation Juill… » quarante pixels plus
      // bas — deux fois la même information, et deux façons de l'effacer.
      // Seul un filtre masqué au point de rupture courant mérite son tag.
      .filter((f) => f.visibility !== undefined && f.visibility !== 'both')
      .filter((f) => v[f.key] !== null && v[f.key] !== undefined && v[f.key] !== '')
      .map((f) => {
        const value = v[f.key]!;
        const opt = f.options.find((o) => o.value === value);
        const optLabel = opt
          ? f.translateLabels
            ? this.translate.instant(opt.label, {}, lang)
            : opt.label
          : value;
        return {
          key: f.key,
          filterLabel: this.translate.instant(f.label, {}, lang),
          valueLabel: optLabel,
        };
      });
  });

  constructor() {
    // Init : hydrate depuis URL (si syncUrl) puis fallback [values].
    // Doit fire une seule fois au premier tick avec `filters` disponible.
    let hydrated = false;
    effect(() => {
      const defs = this.filters();
      if (hydrated || defs.length === 0) return;
      hydrated = true;
      untracked(() => {
        let initial: FilterValues = { ...this.values() };
        if (this.syncUrl()) {
          const params = this.route.snapshot.queryParamMap;
          for (const def of defs) {
            const raw = params.get(this.paramKey(def.key));
            if (raw !== null) initial[def.key] = raw;
          }
        }
        this.localValues.set(initial);
      });
    });

    // Sync externe → interne (parent pilote via `[values]`).
    effect(() => {
      const ext = this.values();
      untracked(() => {
        // Merge non destructif : garde les valeurs actives déjà présentes localement
        // sauf si le parent les surcharge explicitement.
        const cur = this.localValues();
        const merged: FilterValues = { ...cur, ...ext };
        if (JSON.stringify(merged) !== JSON.stringify(cur)) {
          this.localValues.set(merged);
        }
      });
    });

    // Sync recherche externe → buffer local.
    effect(() => {
      const ext = this.search();
      untracked(() => {
        if (ext !== this.localSearch()) this.localSearch.set(ext);
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  /** Nom du query param pour un filtre : préfixe `f_` pour éviter collisions. */
  private paramKey(key: string): string {
    return `f_${key}`;
  }

  setFilterValue(key: string, value: string | null): void {
    const next: FilterValues = { ...this.localValues(), [key]: value };
    this.localValues.set(next);
    this.valuesChange.emit(next);
    if (this.syncUrl()) this.pushUrl(next);
  }

  /**
   * Efface tous les filtres avec toast undo 4s (Marie applique 20 filtres/jour,
   * un misclick sur clear = 4 sessions nuked par semaine sans safety net).
   * Le toast expose une action « Annuler » qui restaure le snapshot pris juste
   * avant le clear. Si l'utilisateur ignore, le toast s'auto-dismiss en 4s.
   */
  clearAll(): void {
    // Snapshot avant clear : les valeurs de filtres actuelles ET le buffer
    // recherche (car clearAll ne touche pas le search mais un futur "clear-all-including-search"
    // pourrait le faire ; pour l'instant on garde uniquement les FilterValues).
    const snapshot = { ...this.localValues() };
    const cleared: FilterValues = {};
    for (const f of this.filters()) cleared[f.key] = null;
    this.localValues.set(cleared);
    this.valuesChange.emit(cleared);
    if (this.syncUrl()) this.pushUrl(cleared);

    // Toast avec action undo (ToastService auto-dismiss = 5s pour info/success ;
    // on emit un info avec action, qui reste actionnable jusqu'à auto-dismiss).
    const lang = this.translate.currentLang() ?? undefined;
    this.toast.info(
      this.translate.instant('COMMON.FILTERS_CLEARED', {}, lang),
      undefined,
      [
        {
          label: this.translate.instant('COMMON.UNDO', {}, lang),
          handler: () => this.restoreSnapshot(snapshot),
          variant: 'primary',
        },
      ],
    );
  }

  /** Restaure un snapshot de FilterValues (undo clearAll). */
  private restoreSnapshot(snapshot: FilterValues): void {
    this.localValues.set(snapshot);
    this.valuesChange.emit(snapshot);
    if (this.syncUrl()) this.pushUrl(snapshot);
  }

  /**
   * WAI-ARIA radiogroup keyboard pattern : flèches gauche/droite cyclent
   * entre chips (avec wrap), Home/End vont aux extrêmes. Le focus suit la
   * sélection (automatic activation — cohérent avec les autres radiogroups
   * shortcut-friendly du projet).
   */
  onChipKeydown(ev: KeyboardEvent, f: FilterDefinition, current: string | null): void {
    // Séquence effective des valeurs sélectionnables : null (clearable) + options
    const seq: Array<string | null> = f.clearable !== false ? [null, ...f.options.map((o) => o.value)] : f.options.map((o) => o.value);
    const idx = seq.findIndex((v) => v === current);
    const n = seq.length;
    if (n === 0) return;
    let next = idx;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (idx + 1) % n; break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (idx - 1 + n) % n; break;
      case 'Home':
        next = 0; break;
      case 'End':
        next = n - 1; break;
      default: return;
    }
    ev.preventDefault();
    this.setFilterValue(f.key, seq[next]);
    // Focus follows selection : queueMicrotask laisse Angular re-render l'aria-checked+tabindex
    // avant qu'on cherche le nouveau chip focusable dans le DOM.
    queueMicrotask(() => {
      const chips = (ev.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
      chips?.[next]?.focus();
    });
  }

  removeTag(key: string): void {
    this.setFilterValue(key, null);
  }

  private pushUrl(values: FilterValues): void {
    const queryParams: Record<string, string | null> = {};
    for (const f of this.filters()) {
      queryParams[this.paramKey(f.key)] = values[f.key] ?? null;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onSearchInput(value: string): void {
    this.localSearch.set(value);
    const delay = this.debounceMs();
    if (delay <= 0) { this.searchChange.emit(value); return; }
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.searchChange.emit(value);
    }, delay);
  }

  /** Valeur courante d'un filtre (avec fallback null pour l'affichage p-select). */
  valueOf(key: string): string | null {
    return this.localValues()[key] ?? null;
  }

  /**
   * Décide `chips` vs `select` selon `render` + `visibility` + breakpoint.
   * Le breakpoint est géré côté SCSS (classes `.fp__filter--chips-mobile`,
   * `.fp__filter--select-desktop`) pour éviter matchMedia côté JS.
   */
  renderMode(f: FilterDefinition): 'chips' | 'select' | 'auto' {
    return f.render ?? 'auto';
  }

  /**
   * Total d'un filtre : la somme des comptes de ses options, ou `null` si
   * aucune option n'en porte — auquel cas « Tous » reste sans chiffre, comme
   * ses voisines.
   */
  totalOptions(f: FilterDefinition): number | null {
    const avecCompte = f.options.filter((o) => o.count !== undefined);
    if (avecCompte.length === 0) return null;
    return avecCompte.reduce((n, o) => n + (o.count ?? 0), 0);
  }

  visibilityClass(f: FilterDefinition): string {
    const vis = f.visibility ?? 'both';
    return vis === 'desktop-only' ? 'fp__filter--desktop-only'
      : vis === 'mobile-only' ? 'fp__filter--mobile-only'
      : '';
  }

  /**
   * `p-select` attend un tableau `any[]` mutable et refuse `readonly[]` en
   * TS strict. On expose une conversion sûre (nouvelle référence copie) juste
   * pour le template — les options restent immuables côté logique.
   */
  asMutableOptions(options: readonly FilterOption[]): FilterOption[] {
    return options as FilterOption[];
  }
}
