import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-success-header',
  templateUrl: './auth-success-header.component.html',
  styleUrl: './auth-success-header.component.scss',
})
export class AuthSuccessHeaderComponent {
  readonly title = input.required<string>();
}
