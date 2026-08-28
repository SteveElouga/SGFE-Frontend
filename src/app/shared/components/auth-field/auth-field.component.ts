import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-field',
  templateUrl: './auth-field.component.html',
  styleUrl: './auth-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthFieldComponent {
  readonly label = input.required<string>();

  /**
   * Marque le champ obligatoire d'un astérisque.
   *
   * `/utilisateurs/nouveau` n'en portait aucun alors que ses trois champs le
   * sont — le bouton restait grisé sans que rien ne dise pourquoi — quand
   * `/abonnes/nouveau` en met partout. L'astérisque seul ne suffit pas : il
   * demande une légende (« Les champs * sont obligatoires ») et, pour qui ne
   * voit pas l'écran, un `aria-required` sur le contrôle lui-même.
   */
  readonly required = input(false);
}
