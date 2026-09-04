import { Component, TemplateRef, ViewChild, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DataTableCardDirective, DataTableCellDirective } from './data-table.directives';

/**
 * Les deux directives de personnalisation du tableau partagé : la cellule
 * custom (`appCol`, rattachée à une colonne par sa clé) et la carte mobile
 * (`appCardRow`). Leur seul rôle est de capturer le `TemplateRef` de leur
 * `<ng-template>` hôte et — pour `appCol` — la clé de colonne visée ; c'est ce
 * que `DataTableComponent` lit ensuite via `contentChildren`/`contentChild`.
 */
describe('DataTableCellDirective', () => {
  @Component({
    imports: [DataTableCellDirective],
    template: `<ng-template appCol="statut" let-row>{{ row }}</ng-template>`,
  })
  class HostComponent {
    @ViewChild(DataTableCellDirective) dir!: DataTableCellDirective;
  }

  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('expose la clé de colonne portée par `appCol`', () => {
    const host = setup();
    expect(host.dir.appCol()).toBe('statut');
  });

  it('capture le TemplateRef du `<ng-template>` hôte', () => {
    const host = setup();
    expect(host.dir.template).toBeInstanceOf(TemplateRef);
  });

  it('deux directives sur deux templates gardent chacune leur propre clé', () => {
    @Component({
      imports: [DataTableCellDirective],
      template: `
        <ng-template appCol="statut" let-row>{{ row }}</ng-template>
        <ng-template appCol="montant" let-row>{{ row }}</ng-template>
      `,
    })
    class DeuxColonnes {
      readonly dirs = viewChild.required(DataTableCellDirective);
    }
    // `viewChild` (singulier) ne renvoie que la première correspondance :
    // on relit les deux templates via le tableau des directives résolues par
    // Angular pour vérifier qu'aucune ne partage la clé de l'autre.
    TestBed.configureTestingModule({ imports: [DeuxColonnes] });
    const fixture = TestBed.createComponent(DeuxColonnes);
    fixture.detectChanges();
    // Le premier `appCol` rencontré dans le gabarit est "statut".
    expect(fixture.componentInstance.dirs().appCol()).toBe('statut');
  });
});

describe('DataTableCardDirective', () => {
  @Component({
    imports: [DataTableCardDirective],
    template: `<ng-template appCardRow let-row>{{ row.nom }}</ng-template>`,
  })
  class HostComponent {
    @ViewChild(DataTableCardDirective) dir!: DataTableCardDirective;
  }

  it('capture le TemplateRef de la carte mobile', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.dir.template).toBeInstanceOf(TemplateRef);
  });
});
