import { Pipe, PipeTransform } from '@angular/core';
import { nomAbonne } from '../utils/abonne.utils';

/**
 * `{{ abonne.prenom | nomAbonne: abonne.nom }}` — voir `nomAbonne()` pour
 * l'ordre retenu et sa justification.
 */
@Pipe({ name: 'nomAbonne', standalone: true })
export class NomAbonnePipe implements PipeTransform {
  transform(prenom?: string | null, nom?: string | null): string {
    return nomAbonne(prenom, nom);
  }
}
