import { Pipe, PipeTransform } from '@angular/core';

/** Formatage programmatique (ex. paramètres de traduction) — voir aussi `FcfaPipe` pour les templates. */
export function formatFcfa(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('fr-FR')} FCFA`;
}

@Pipe({ name: 'fcfa', standalone: true })
export class FcfaPipe implements PipeTransform {
  transform(n: number | null | undefined): string {
    return formatFcfa(n);
  }
}
