import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // La racine lit la langue active pour la refléter sur `<html lang>` :
      // sans ce fournisseur, elle ne peut pas être instanciée.
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('reflects the active language on the document element', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });
});
