import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-field',
  templateUrl: './auth-field.component.html',
  styleUrl: './auth-field.component.scss',
})
export class AuthFieldComponent {
  readonly label = input.required<string>();
}
