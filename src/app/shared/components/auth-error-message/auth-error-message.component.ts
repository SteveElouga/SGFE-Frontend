import { Component, input } from '@angular/core';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-auth-error-message',
  imports: [MessageModule],
  template: `
    @if (text()) {
      <p-message
        severity="error"
        size="small"
        icon="pi pi-exclamation-circle"
        [closable]="true"
        [text]="text()!"
      />
    }
  `,
})
export class AuthErrorMessageComponent {
  readonly text = input<string | null>(null);
}
