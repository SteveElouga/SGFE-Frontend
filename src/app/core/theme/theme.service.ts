import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'theme.preference';

function lireSystemePrefereSombre(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function lirePreferenceStockee(): ThemePreference {
  const valeur = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
  return valeur === 'light' || valeur === 'dark' ? valeur : 'auto';
}

/**
 * Suit le thème du système par défaut (`auto`), avec une préférence manuelle
 * qui prend le pas dessus quand l'abonné en choisit une — persistée en local,
 * même idiome que `dashboard.periode` (`dashboard.component.ts`).
 *
 * PrimeNG est configuré avec `darkModeSelector: '.p-dark'` (`app.config.ts`) :
 * un sélecteur de media query directe (`system`, le défaut de la bibliothèque)
 * ne peut pas être piloté par un script, donc pas de bascule manuelle possible
 * avec lui. La classe posée ici sur `<html>` gouverne à la fois les jetons
 * PrimeNG et ceux de l'application (`:root.p-dark` dans `_tokens.scss`).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly systemePrefereSombre = signal(lireSystemePrefereSombre());
  readonly preference = signal<ThemePreference>(lirePreferenceStockee());

  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const pref = this.preference();
    return pref === 'auto' ? (this.systemePrefereSombre() ? 'dark' : 'light') : pref;
  });

  constructor() {
    if (typeof matchMedia !== 'undefined') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemePrefereSombre.set(e.matches);
      });
    }

    effect(() => {
      document.documentElement.classList.toggle('p-dark', this.resolvedTheme() === 'dark');
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  }
}
