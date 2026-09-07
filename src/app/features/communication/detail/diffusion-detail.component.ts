import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import type { Subscription } from 'rxjs';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommunicationService } from '../../../core/communication/communication.service';
import { extractGqlError } from '../../../core/auth/auth.service';
import { DIFFUSION_PROGRESSION_UPDATED_SUB } from '../../../graphql/queries/communication.queries';
import { PageTopbarComponent } from '../../../shared/components/page-topbar/page-topbar.component';
import type { DiffusionProgressionUpdatedSubscription, GetDiffusionQuery } from '../../../graphql/generated';

type Diffusion = NonNullable<GetDiffusionQuery['diffusion']>;

@Component({
  selector: 'app-diffusion-detail',
  imports: [DatePipe, PageTopbarComponent, TranslatePipe],
  templateUrl: './diffusion-detail.component.html',
  styleUrl: './diffusion-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffusionDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CommunicationService);
  private readonly apollo = inject(Apollo);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  private diffusionId = '';
  /** Abonnement à la progression en direct de la diffusion courante — désabonné
   *  et reposé à chaque changement de `diffusionId` (voir `ngOnInit`), pas
   *  seulement à la destruction du composant : `/communication/:id` est une
   *  seule route, Angular réutilise ce même composant d'une diffusion à
   *  l'autre, `takeUntilDestroyed` seul laisserait tourner l'abonnement de
   *  l'ancienne diffusion en plus de la nouvelle. */
  private progressionSub?: Subscription;

  readonly diffusion = signal<Diffusion | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  pourcentage(): number {
    const d = this.diffusion();
    if (!d || d.nbTotal === 0) return 0;
    return Math.round((d.nbEnvoyes / d.nbTotal) * 100);
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.diffusionId = (params['id'] as string) ?? '';
      void this.load();

      // Progression en direct : identique au patron de campagne-detail
      // (progressionUpdated) — écrit dans un signal local, échoue en silence
      // (l'écran garde la dernière valeur chargée) si le temps réel est
      // indisponible.
      this.progressionSub?.unsubscribe();
      this.progressionSub = this.apollo
        .subscribe<DiffusionProgressionUpdatedSubscription>({
          query: DIFFUSION_PROGRESSION_UPDATED_SUB,
          variables: { diffusionId: this.diffusionId },
          context: { silentError: true },
        })
        .subscribe({
          next: ({ data }) => {
            const d = data?.diffusionProgressionUpdated;
            if (d) this.diffusion.set(d);
          },
          error: () => {
            /* Temps réel indisponible — l'écran garde la valeur chargée. */
          },
        });
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const d = await this.service.getDiffusion(this.diffusionId);
      if (d) this.diffusion.set(d);
      else this.error.set(this.translate.instant('COMMUNICATION.ERROR_NOT_FOUND'));
    } catch (err: unknown) {
      const { message } = extractGqlError(err);
      this.error.set(message || this.translate.instant('COMMUNICATION.ERROR_LOAD'));
    } finally {
      this.loading.set(false);
    }
  }
}
