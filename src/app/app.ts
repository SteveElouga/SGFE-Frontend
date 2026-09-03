import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { ThemeService } from './core/theme/theme.service';

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
  // Un service `providedIn: 'root'` ne s'instancie qu'à sa première injection.
  // Rien d'autre n'injecte `ThemeService` avant l'ouverture du menu utilisateur
  // (la bascule manuelle) — sans cette ligne, le thème système ne serait donc
  // appliqué qu'après un premier clic là-bas, jamais au chargement.
  private readonly theme = inject(ThemeService);

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
