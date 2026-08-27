import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly translate = inject(TranslateService);

  constructor() {
    // `index.html` est servi avec lang="fr" (langue de référence, PRODUCT.md § 4).
    // Le document doit suivre la langue réellement affichée : un lecteur d'écran
    // prononce sinon du français avec une phonétique anglaise.
    effect(() => {
      const lang = this.translate.currentLang() ?? this.translate.getFallbackLang() ?? 'fr';
      this.document.documentElement.setAttribute('lang', lang);
    });
  }
}
