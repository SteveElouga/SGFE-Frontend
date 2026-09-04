import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { AuthFieldComponent } from './auth-field.component';

/**
 * Champ d'auth générique : label + astérisque conditionnel + contenu projeté
 * (le contrôle lui-même, et un slot optionnel pour une aide/icône).
 */
describe('AuthFieldComponent', () => {
  @Component({
    imports: [AuthFieldComponent],
    template: `
      <app-auth-field [label]="label" [required]="required">
        <span authFieldExtra class="extra">aide</span>
        <input class="controle" />
      </app-auth-field>
    `,
  })
  class HostComponent {
    label = 'Mot de passe';
    required = false;
  }

  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it("affiche le libellé sans astérisque quand le champ n'est pas obligatoire", () => {
    const { racine } = setup();
    expect(racine.querySelector('.auth-field__label')?.textContent).toContain('Mot de passe');
    expect(racine.querySelector('.auth-field__requis')).toBeNull();
  });

  it('ajoute un astérisque quand le champ est obligatoire', () => {
    TestBed.configureTestingModule({ imports: [AuthFieldComponent] });
    const fixture = TestBed.createComponent(AuthFieldComponent);
    fixture.componentRef.setInput('label', 'Téléphone');
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.auth-field__requis')).toBeTruthy();
  });

  it('projette le contrôle et le slot additionnel', () => {
    const { racine } = setup();
    expect(racine.querySelector('.controle')).toBeTruthy();
    expect(racine.querySelector('.extra')?.textContent).toBe('aide');
  });
});
