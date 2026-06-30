import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Popover, PopoverModule } from 'primeng/popover';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-user-menu',
  imports: [PopoverModule, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  private readonly menuRef = viewChild<Popover>('menu');

  readonly isOpen = signal(false);
  readonly user = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;
  readonly currentLang = this.translate.currentLang;

  readonly userInitial = computed(() => {
    const u = this.user();
    return u ? u.username.charAt(0).toUpperCase() : '?';
  });

  readonly avatarColor = computed(() => {
    const colors = ['#1a56db', '#0d9488', '#7c3aed', '#db2777', '#d97706'];
    const code = (this.user()?.username.codePointAt(0) ?? 0) % colors.length;
    return colors[code];
  });

  toggle(event: MouseEvent): void {
    this.menuRef()?.toggle(event);
  }

  onShow(): void {
    this.isOpen.set(true);
  }

  onHide(): void {
    this.isOpen.set(false);
  }

  close(): void {
    this.menuRef()?.hide();
  }

  setLang(lang: 'fr' | 'en'): void {
    this.translate.use(lang);
  }

  async logout(): Promise<void> {
    this.menuRef()?.hide();
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
