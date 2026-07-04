import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * Cellule custom pour une colonne du tableau partagé.
 *
 * Usage : `<ng-template appCol="statut" let-row>…</ng-template>`
 * La clé doit correspondre à `DataTableColumn.key`. Si aucune cellule custom
 * n'est fournie pour une colonne, le tableau affiche `row[key]` par défaut.
 */
@Directive({ selector: 'ng-template[appCol]' })
export class DataTableCellDirective {
  /** Clé de la colonne ciblée. */
  readonly appCol = input.required<string>();
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * Rendu « carte » d'une ligne, affiché à la place du tableau en mobile (≤ 720px).
 *
 * Usage : `<ng-template appCardRow let-row>…</ng-template>`
 */
@Directive({ selector: 'ng-template[appCardRow]' })
export class DataTableCardDirective {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
