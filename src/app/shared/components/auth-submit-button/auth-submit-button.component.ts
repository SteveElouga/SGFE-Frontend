import { Component, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-auth-submit-button',
  imports: [ButtonModule],
  template: `
    <p-button
      type="submit"
      [label]="label()"
      [icon]="icon()"
      iconPos="right"
      [loading]="loading()"
      [disabled]="disabled()"
      [raised]="true"
      loadingIcon="pi pi-spinner pi-spin"
      [style]="{ width: '100%' }"
    />
  `,
})
export class AuthSubmitButtonComponent {
  readonly label = input.required<string>();
  readonly icon = input('pi pi-arrow-right');
  readonly loading = input(false);
  readonly disabled = input(false);
}
