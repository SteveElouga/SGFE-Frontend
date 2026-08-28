import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-error-message',
  templateUrl: './auth-error-message.component.html',
  styleUrl: './auth-error-message.component.scss',
  host: {
    '[style.display]': 'text() ? "flex" : "none"',
    // Ce message suit une action — une connexion refusée, un envoi échoué — et
    // doit interrompre ce que l'utilisateur faisait. Posé sur l'hôte parce que
    // la mise en page est une grille flex sur `:host`.
    role: 'alert',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthErrorMessageComponent {
  readonly text = input<string | null>(null);
}
