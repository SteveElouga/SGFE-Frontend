import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'compteur', standalone: true })
export class CompteurPipe implements PipeTransform {
  transform(n: number | null | undefined): string {
    if (n == null) return '—';
    return `C-${String(n).padStart(4, '0')}`;
  }
}
