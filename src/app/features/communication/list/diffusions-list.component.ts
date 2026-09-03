import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommunicationService } from '../../../core/communication/communication.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import { DataTableComponent, DataTableColumn } from '../../../shared/components/data-table/data-table.component';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table.directives';
import type { GetDiffusionsQuery } from '../../../graphql/generated';

type DiffusionLigne = GetDiffusionsQuery['diffusions'][number];

@Component({
  selector: 'app-diffusions-list',
  imports: [RouterLink, DatePipe, PageTopbarComponent, DataTableComponent, DataTableCellDirective, TranslatePipe],
  templateUrl: './diffusions-list.component.html',
  styleUrl: './diffusions-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffusionsListComponent implements OnInit {
  private readonly service = inject(CommunicationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  protected readonly lienDiffusion = (d: DiffusionLigne) => ['/communication', d.diffusionId];

  readonly diffusions = signal<DiffusionLigne[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly columns: DataTableColumn[] = [
    { key: 'message', header: 'COMMUNICATION.COL_MESSAGE' },
    { key: 'progression', header: 'COMMUNICATION.COL_PROGRESSION' },
    { key: 'createdBy', header: 'COMMUNICATION.COL_PAR' },
    { key: 'createdAt', header: 'COMMUNICATION.COL_DATE' },
  ];

  ngOnInit(): void {
    this.loading.set(true);
    this.service
      .watchDiffusions()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data, loading }) => {
          this.loading.set(loading);
          // Cette requête ne demande pas `returnPartialData` : la conversion
          // énonce l'invariant que la configuration garantit (même motif que
          // `abonnes-list.component.ts`).
          if (data?.diffusions) this.diffusions.set(data.diffusions as DiffusionLigne[]);
        },
        error: (err: unknown) => {
          const { message } = extractGqlError(err);
          this.error.set(message || this.translate.instant('COMMUNICATION.ERROR_LOAD'));
          this.loading.set(false);
        },
      });
  }

  pourcentage(d: DiffusionLigne): number {
    return d.nbTotal > 0 ? Math.round((d.nbEnvoyes / d.nbTotal) * 100) : 0;
  }
}
