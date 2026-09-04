import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AuthBrandPanelComponent } from './auth-brand-panel.component';

/**
 * Panneau de marque des écrans d'auth : décor + logo + nom/slogan traduits +
 * contenu projeté (le pitch, propre à chaque écran).
 */
describe('AuthBrandPanelComponent', () => {
  @Component({
    imports: [AuthBrandPanelComponent],
    template: `<app-auth-brand-panel><p class="pitch">Facturez votre eau sans tracas.</p></app-auth-brand-panel>`,
  })
  class HostComponent {}

  function setup() {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { APP: { NAME: 'Facturation Eau', TAGLINE: 'Simple et fiable' } });
    translate.use('fr');

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le nom et le slogan traduits de l’application', () => {
    const { racine } = setup();
    expect(racine.textContent).toContain('Facturation Eau');
    expect(racine.textContent).toContain('Simple et fiable');
  });

  it('projette le pitch fourni par l’écran appelant', () => {
    const { racine } = setup();
    const pitch = racine.querySelector('.auth-brand__pitch .pitch');
    expect(pitch?.textContent).toContain('Facturez votre eau sans tracas.');
  });
});
