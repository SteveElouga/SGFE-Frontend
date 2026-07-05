import { Injectable, signal } from '@angular/core';

/**
 * État de mise en page partagé. Pilote le tiroir de navigation mobile :
 * la topbar/terrain ouvre le menu, le shell l'affiche en tiroir + scrim et
 * le referme à chaque navigation.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  openMenu(): void {
    this.menuOpen.set(true);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
