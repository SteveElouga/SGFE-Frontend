import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe, LowerCasePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { nomAbonne } from '../../../../shared/utils/abonne.utils';
import { releveStatutTone } from '../../../../shared/models/campagne.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { FilterChipsComponent, FilterChip } from '../../../../shared/components/filter-chips/filter-chips.component';
import type { ReleveLigne } from '../../../../graphql/vues';

/**
 * Section « Relevés » de la fiche campagne — filtres (quartier/statut,
 * chips mobile M-05) + table desktop + cartes mobile MB-02.
 *
 * Extraite de `CampagneDetailComponent` : les filtres sont un état
 * strictement local à l'affichage (rien d'autre n'en dépend), la correction
 * d'un relevé reste possédée par le parent — c'est lui qui met à jour la
 * liste `releves` et pilote `<app-corriger-releve-sheet>` — donc seulement
 * **signalée** via `corriger`.
 */
@Component({
  selector: 'app-releves-panel',
  imports: [
    DecimalPipe,
    LowerCasePipe,
    SlicePipe,
    FormsModule,
    SelectModule,
    TranslatePipe,
    BadgeComponent,
    FilterChipsComponent,
  ],
  templateUrl: './releves-panel.component.html',
  styleUrl: './releves-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelevesPanelComponent {
  private readonly translate = inject(TranslateService);

  /** Ordre d'affichage unique du nom d'abonné — voir `abonne.utils.ts`. */
  protected readonly nomAbonne = nomAbonne;
  protected readonly releveStatutTone = releveStatutTone;

  readonly releves = input<ReleveLigne[]>([]);
  // abonneId → quartier, pour le filtre et l'affichage de repli.
  readonly abonnesMap = input<Map<string, string>>(new Map());
  readonly canActOnCampagne = input(false);

  /** Émis quand l'utilisateur demande la correction d'un relevé déjà saisi. */
  readonly corriger = output<ReleveLigne>();

  // ── Filtres ────────────────────────────────────────────────────────────────
  readonly filtreReleveStatut = signal('TOUS');
  readonly filtreQuartier = signal<string | null>(null);

  readonly relevesByStatut = computed(() => {
    const list = this.releves();
    return {
      aRelever: list.filter((r) => r.statut === 'A_RELEVER').length,
      releve: list.filter((r) => r.statut === 'RELEVE').length,
      nonReleve: list.filter((r) => r.statut === 'NON_RELEVE').length,
      estime: list.filter((r) => r.statut === 'ESTIME').length,
    };
  });

  readonly statutReleveOptions = computed(() => [
    { label: this.translate.instant('CAMPAGNES.FILTRE_STATUT_RELEVE'), value: 'TOUS' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.RELEVE'), value: 'RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.ESTIME'), value: 'ESTIME' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.NON_RELEVE'), value: 'NON_RELEVE' },
    { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.A_RELEVER'), value: 'A_RELEVER' },
  ]);

  /** Chips de statut des relevés (mobile, pattern M-05) : pluriels + compteurs. */
  readonly releveChips = computed((): FilterChip[] => {
    const lang = this.translate.currentLang() ?? undefined;
    const h = this.relevesByStatut();
    return [
      { label: this.translate.instant('CAMPAGNES.KPI_RELEVES', {}, lang), value: 'RELEVE', count: h.releve },
      { label: this.translate.instant('CAMPAGNES.KPI_ESTIMES', {}, lang), value: 'ESTIME', count: h.estime },
      { label: this.translate.instant('CAMPAGNES.KPI_NON_RELEVES', {}, lang), value: 'NON_RELEVE', count: h.nonReleve },
      { label: this.translate.instant('CAMPAGNES.RELEVE_STATUT.A_RELEVER', {}, lang), value: 'A_RELEVER', count: h.aRelever },
    ];
  });

  /** Valeur des chips : `null` = « Tous » (le signal utilise 'TOUS'). */
  readonly releveChipValue = computed(() => {
    const statut = this.filtreReleveStatut();
    return statut === 'TOUS' ? null : statut;
  });

  onReleveChip(value: string | null): void {
    this.filtreReleveStatut.set(value ?? 'TOUS');
  }

  readonly quartiersDisponibles = computed(() => {
    const map = this.abonnesMap();
    const releves = this.releves();
    const set = new Set<string>();
    releves.forEach((r) => {
      const q = map.get(r.abonneId);
      if (q) set.add(q);
    });
    const lang = this.translate.currentLang() ?? undefined;
    return [
      { label: this.translate.instant('CAMPAGNES.FILTRE_QUARTIER', {}, lang), value: null },
      ...[...set].sort((a, b) => a.localeCompare(b, 'fr')).map((q) => ({ label: q, value: q })),
    ];
  });

  readonly relevesFiltres = computed(() => {
    let list = this.releves();
    const statut = this.filtreReleveStatut();
    if (statut !== 'TOUS') list = list.filter((r) => r.statut === statut);
    const quartier = this.filtreQuartier();
    if (quartier) {
      const map = this.abonnesMap();
      list = list.filter((r) => map.get(r.abonneId) === quartier);
    }
    return list;
  });
}
