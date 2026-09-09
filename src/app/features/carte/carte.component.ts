import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { GeoJSONSource, Map as MaplibreMap, Marker as MaplibreMarker } from 'maplibre-gl';
import { environment } from '../../../environments/environment';
import { extractGqlError } from '../../core/auth/auth.service';
import { AbonnesService } from '../../core/abonnes/abonnes.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ToastService } from '../../shared/services/toast.service';
import { StatutAbonne } from '../../shared/models/abonne.model';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { PageTopbarComponent } from '../../shared/components/page-topbar/page-topbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { FiltersPanelComponent, FilterDefinition, FilterValues } from '../../shared/components/filters-panel/filters-panel.component';
import { CompteurPipe } from '../../shared/pipes/compteur.pipe';
import { NomAbonnePipe } from '../../shared/pipes/nom-abonne.pipe';
import { CarteService } from './services/carte.service';
import { ItineraireService } from './services/itineraire.service';
import { creerElementMarqueur } from './services/marqueur.util';
import { CompteurPlaceCardComponent } from './compteur-place-card/compteur-place-card.component';
import { ImportCoordonneesSheetComponent } from './import-coordonnees-sheet/import-coordonnees-sheet.component';
import type { CompteurGeoPoint, ResultatItineraire } from './carte.model';
import type { AbonneLigne } from '../../graphql/vues';
import type { GetAbonnesQuery } from '../../graphql/generated';

const STYLE_SOMBRE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const STYLE_CLAIR = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SOURCE_ITINERAIRE = 'itineraire';

/**
 * Écran Carte (ADMIN) — voir la mission (features/carte) pour la spécification
 * complète. Bibliothèque de carte chargée en lazy (`import('maplibre-gl')`
 * dans `ngAfterViewInit`, même pattern que Faro dans `main.ts`) : la route
 * elle-même est déjà lazy-loadée, mais MapLibre pèse assez pour mériter un
 * second niveau de découpage plutôt que de grever le chunk de cette seule
 * page.
 */
@Component({
  selector: 'app-carte',
  imports: [
    TranslatePipe,
    ErrorBannerComponent,
    SkeletonComponent,
    PageTopbarComponent,
    StatusBadgeComponent,
    FiltersPanelComponent,
    CompteurPipe,
    NomAbonnePipe,
    CompteurPlaceCardComponent,
    ImportCoordonneesSheetComponent,
  ],
  templateUrl: './carte.component.html',
  styleUrl: './carte.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarteComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly abonnesService = inject(AbonnesService);
  private readonly carteService = inject(CarteService);
  private readonly itineraireService = inject(ItineraireService);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  private abonnesQuery!: QueryRef<GetAbonnesQuery>;
  private map: MaplibreMap | null = null;
  private maplibregl: typeof import('maplibre-gl') | null = null;
  private markersActuels: MaplibreMarker[] = [];
  private lastAppliedTheme: 'light' | 'dark' | null = null;
  private dernierResultatItineraire: ResultatItineraire | null = null;

  readonly mapPret = signal(false);
  readonly mapErreur = signal<string | null>(null);

  readonly abonnes = signal<AbonneLigne[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly searchTerm = signal('');
  readonly statutFilter = signal<StatutAbonne | null>(null);
  readonly quartierFilter = signal<string | null>(null);

  /** Panneau latéral rétractable (mission). Ouvert par défaut. */
  readonly panelOpen = signal(true);
  readonly importSheetOpen = signal(false);
  readonly selectedAbonneId = signal<string | null>(null);

  readonly itineraireResultat = signal<ResultatItineraire | null>(null);
  readonly itineraireLoading = signal(false);
  readonly itineraireErreur = signal<string | null>(null);

  readonly quartiersDisponibles = computed(() =>
    [...new Set(this.abonnes().map((a) => a.compteur?.quartier).filter((q): q is string => !!q))].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' }),
    ),
  );

  readonly filtersConfig = computed<FilterDefinition[]>(() => {
    const lang = this.translate.currentLang() ?? undefined;
    const chips: Array<{ key: string; value: StatutAbonne }> = [
      { key: 'ABONNES.CHIP_ACTIFS', value: 'ACTIF' },
      { key: 'ABONNES.CHIP_SUSPENDUS', value: 'SUSPENDU' },
      { key: 'ABONNES.CHIP_RESILIES', value: 'RESILIE' },
    ];
    return [
      {
        key: 'statut',
        label: 'ABONNES.STATUT_FILTER',
        options: chips.map((c) => ({ label: this.translate.instant(c.key, {}, lang), value: c.value })),
      },
      {
        key: 'quartier',
        label: 'ABONNES.QUARTIER_FILTER',
        options: this.quartiersDisponibles().map((q) => ({ label: q, value: q })),
        render: 'select',
      },
    ];
  });

  readonly filterValues = computed<FilterValues>(() => ({
    statut: this.statutFilter(),
    quartier: this.quartierFilter(),
  }));

  readonly filteredAbonnes = computed(() => {
    let list = this.abonnes();
    const term = this.searchTerm().toLowerCase().trim();
    const statut = this.statutFilter();
    const quartier = this.quartierFilter();
    if (statut) list = list.filter((a) => a.statut === statut);
    if (quartier) list = list.filter((a) => a.compteur?.quartier === quartier);
    if (term) {
      list = list.filter(
        (a) =>
          `${a.nom} ${a.prenom}`.toLowerCase().includes(term) ||
          a.numeroAbonne.toLowerCase().includes(term) ||
          String(a.compteur?.numeroCompteur ?? '').includes(term),
      );
    }
    return list;
  });

  /** Compteurs géolocalisables parmi les abonnés filtrés — `null` (compteur
   *  non géolocalisé) filtré silencieusement, comportement normal. */
  readonly markers = computed<CompteurGeoPoint[]>(() =>
    this.filteredAbonnes()
      .map((a) => this.carteService.toGeoPoint(a))
      .filter((p): p is CompteurGeoPoint => p !== null),
  );

  readonly selectedAbonne = computed<AbonneLigne | null>(
    () => this.abonnes().find((a) => a.id === this.selectedAbonneId()) ?? null,
  );
  readonly selectedGeo = computed<CompteurGeoPoint | null>(
    () => this.markers().find((m) => m.abonneId === this.selectedAbonneId()) ?? null,
  );
  readonly placeCardOpen = computed(() => this.selectedAbonneId() !== null);

  constructor() {
    // Thème → style de fond de carte (mission : suivre le thème de l'app,
    // pas rester figé en sombre). `mapPret` (signal) plutôt que le champ
    // `this.map` (non réactif) : garantit que cet effect se déclenche à
    // nouveau une fois la carte prête, même si le thème a changé pendant le
    // chargement asynchrone de MapLibre.
    effect(() => {
      const theme = this.themeService.resolvedTheme();
      if (!this.mapPret() || !this.map) return;
      if (this.lastAppliedTheme === theme) return;
      this.lastAppliedTheme = theme;
      this.map.setStyle(theme === 'dark' ? STYLE_SOMBRE : STYLE_CLAIR);
    });

    // Repères sur la carte — se ré-exécute à chaque changement de filtre.
    effect(() => {
      const points = this.markers();
      if (!this.mapPret() || !this.map || !this.maplibregl) return;
      this.rafraichirMarqueurs(points);
    });
  }

  ngOnInit(): void {
    this.abonnesQuery = this.abonnesService.watchAbonnes({});
    this.abonnesQuery.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data, loading }) => {
        this.loading.set(loading);
        if (data?.abonnes) {
          this.abonnes.set(data.abonnes as AbonneLigne[]);
        } else if (!loading) {
          this.error.set(this.translate.instant('ERRORS.LOAD_ABONNES'));
        }
      },
      error: (err: unknown) => {
        const { message } = extractGqlError(err);
        this.error.set(message || this.translate.instant('ERRORS.LOAD_ABONNES'));
        this.loading.set(false);
      },
    });

    // Deep-link depuis la fiche abonné (« Voir sur la carte », query param
    // `compteurAbonneId`) : présélectionne la ligne au chargement, une fois
    // la liste arrivée. `pattern déjà standard dans ce dépôt` (mission) :
    // `route.queryParams`.
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params['compteurAbonneId'];
      if (id) this.selectAbonne(id);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    const container = this.mapEl()?.nativeElement;
    if (!container) {
      // Ne devrait pas arriver (le conteneur est toujours dans le gabarit,
      // pas derrière un `@if`) — filet de sécurité plutôt qu'un écran blanc
      // silencieux si jamais la structure du gabarit change un jour.
      this.mapErreur.set(this.translate.instant('CARTE.ERREUR_CHARGEMENT'));
      return;
    }
    try {
      this.injecterCssMaplibre();
      const maplibregl = await import('maplibre-gl');
      this.maplibregl = maplibregl;
      const theme = this.themeService.resolvedTheme();
      const origine = environment.origineItineraire;
      this.map = new maplibregl.Map({
        container,
        style: theme === 'dark' ? STYLE_SOMBRE : STYLE_CLAIR,
        center: [origine.lon, origine.lat],
        zoom: 12,
      });
      this.lastAppliedTheme = theme;
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      this.map.on('load', () => this.assurerCoucheItineraire());
      this.map.on('style.load', () => this.assurerCoucheItineraire());
      this.map.on('error', (e) => {
        // MapLibre émet cet évènement pour toute ressource en échec (tuile,
        // style) sans jamais lever d'exception JS — sans ce relais, une
        // gateway de tuiles indisponible se traduit par une carte blanche
        // strictement silencieuse.
        console.error('[carte] erreur MapLibre :', e?.error ?? e);
      });
      this.mapPret.set(true);
    } catch (err) {
      console.error('[carte] échec du chargement de MapLibre GL :', err);
      this.mapErreur.set(this.translate.instant('CARTE.ERREUR_CHARGEMENT'));
    }
  }

  ngOnDestroy(): void {
    for (const m of this.markersActuels) m.remove();
    this.map?.remove();
    this.map = null;
  }

  /**
   * `maplibre-gl.css` chargé en même temps que la bibliothèque (lazy), pas en
   * statique dans `styles.scss` — sinon il partirait dans le bundle initial
   * pour un écran qui ne se charge jamais avant `/carte`. Copié dans les
   * assets par `angular.json` (`node_modules/maplibre-gl/dist/maplibre-gl.css`
   * → `/maplibre-gl.css`) plutôt qu'un import ESM du CSS depuis le
   * `.ts` : évite de dépendre du traitement des imports CSS dynamiques par le
   * bundler, plus difficile à garantir identique entre `ng serve` (Vite) et
   * `ng build` (esbuild).
   */
  private injecterCssMaplibre(): void {
    if (document.getElementById('maplibre-gl-css')) return;
    const link = document.createElement('link');
    link.id = 'maplibre-gl-css';
    link.rel = 'stylesheet';
    link.href = 'maplibre-gl.css';
    document.head.appendChild(link);
  }

  private rafraichirMarqueurs(points: CompteurGeoPoint[]): void {
    for (const m of this.markersActuels) m.remove();
    this.markersActuels = [];
    const maplibregl = this.maplibregl;
    const map = this.map;
    if (!maplibregl || !map) return;
    for (const point of points) {
      const el = creerElementMarqueur(point);
      el.addEventListener('click', () => this.selectAbonne(point.abonneId));
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
      this.markersActuels.push(marker);
    }
  }

  private assurerCoucheItineraire(): void {
    const map = this.map;
    if (!map) return;
    if (!map.getSource(SOURCE_ITINERAIRE)) {
      map.addSource(SOURCE_ITINERAIRE, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: SOURCE_ITINERAIRE,
        type: 'line',
        source: SOURCE_ITINERAIRE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4 },
      });
    }
    if (this.dernierResultatItineraire) this.dessinerItineraire(this.dernierResultatItineraire);
  }

  private dessinerItineraire(resultat: ResultatItineraire): void {
    const map = this.map;
    if (!map) return;
    const source = map.getSource(SOURCE_ITINERAIRE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: resultat.geometrie },
    });
    // Ligne pointillée pour une estimation à vol d'oiseau, pleine pour un
    // itinéraire routier réel (OSRM) — annoncer visuellement la différence,
    // pas seulement dans le texte (mission : « en l'annonçant clairement
    // comme une estimation »).
    map.setPaintProperty(SOURCE_ITINERAIRE, 'line-dasharray', resultat.estimation ? [2, 2] : [1, 0]);
  }

  togglePanel(): void {
    this.panelOpen.update((v) => !v);
  }

  onFiltersChange(v: FilterValues): void {
    this.statutFilter.set((v['statut'] as StatutAbonne | null) ?? null);
    this.quartierFilter.set(v['quartier']);
  }

  selectAbonne(id: string): void {
    this.selectedAbonneId.set(id);
    this.itineraireResultat.set(null);
    this.itineraireErreur.set(null);
    this.dernierResultatItineraire = null;
    const geo = this.selectedGeo();
    if (geo && this.map) {
      this.map.flyTo({ center: [geo.longitude, geo.latitude], zoom: 15 });
    }
  }

  closePlaceCard(): void {
    this.selectedAbonneId.set(null);
    this.itineraireResultat.set(null);
    this.itineraireErreur.set(null);
  }

  async onDemanderItineraire(): Promise<void> {
    const geo = this.selectedGeo();
    if (!geo) return;
    this.itineraireLoading.set(true);
    this.itineraireErreur.set(null);
    try {
      const resultat = await this.itineraireService.calculer(environment.origineItineraire, {
        lat: geo.latitude,
        lon: geo.longitude,
      });
      this.itineraireResultat.set(resultat);
      this.dernierResultatItineraire = resultat;
      this.dessinerItineraire(resultat);
    } catch {
      // `ItineraireService.calculer` ne rejette normalement jamais (repli
      // Haversine interne) — filet de sécurité si jamais ça change.
      this.itineraireErreur.set(this.translate.instant('CARTE.ITINERAIRE.ERREUR'));
    } finally {
      this.itineraireLoading.set(false);
    }
  }

  ouvrirImport(): void {
    this.importSheetOpen.set(true);
  }

  fermerImport(): void {
    this.importSheetOpen.set(false);
  }

  onImportReussi(nbImportees: number): void {
    this.toast.success(this.translate.instant('CARTE.IMPORT.RESULTAT_NB', { count: nbImportees }));
  }
}
