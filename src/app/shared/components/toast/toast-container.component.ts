import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  progressPercent(toast: Toast): number {
    if (!toast.total || toast.total === 0) return 0;
    return Math.min(100, Math.round(((toast.current ?? 0) / toast.total) * 100));
  }

  actionHandler(handler: () => void, toastId: string): void {
    handler();
    this.toastService.dismiss(toastId);
  }
}
