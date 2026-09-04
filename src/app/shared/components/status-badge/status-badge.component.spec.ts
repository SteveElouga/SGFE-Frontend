import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import { BadgeStatus, StatusBadgeComponent } from './status-badge.component';
import { TooltipDirective } from '../../directives/tooltip.directive';

/**
 * Traduit un statut du domaine en teinte de badge. C'est la seule décision de
 * ce composant — le reste (rendu, infobulle) est délégué à `app-badge` et à
 * `appTooltip`.
 */
describe('StatusBadgeComponent', () => {
  function setup(status: BadgeStatus, translations?: TranslationObject) {
    TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    if (translations) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr', translations);
      translate.use('fr');
    }
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it.each([
    ['ACTIF', 'success'],
    ['ACTIVE', 'success'],
    ['SUSPENDU', 'warning'],
    ['INACTIVE', 'warning'],
    ['RESILIE', 'danger'],
  ] as const)('associe %s à la teinte %s', (status, teinte) => {
    const { c, racine } = setup(status);
    expect(c.ton()).toBe(teinte);
    expect(racine.querySelector(`.badge--${teinte}`)).toBeTruthy();
  });

  it('retombe sur la teinte neutre pour un statut du domaine non répertorié', () => {
    // Un backend plus ancien peut renvoyer une valeur que ce composant ne
    // connaît pas encore : mieux vaut une teinte neutre qu'un badge cassé.
    const { c } = setup('INCONNU' as BadgeStatus);
    expect(c.ton()).toBe('neutral');
  });

  it('porte la clé d’infobulle correspondant au statut SUSPENDU', () => {
    const { fixture } = setup('SUSPENDU');
    const dir = fixture.debugElement.query(By.directive(TooltipDirective)).injector.get(TooltipDirective);
    expect(dir.appTooltip()).toBe('STATUT_BADGE.SUSPENDU_AIDE');
  });

  it('porte une clé différente pour un autre statut (RESILIE)', () => {
    const { fixture } = setup('RESILIE');
    const dir = fixture.debugElement.query(By.directive(TooltipDirective)).injector.get(TooltipDirective);
    expect(dir.appTooltip()).toBe('STATUT_BADGE.RESILIE_AIDE');
  });

  it('affiche le libellé traduit du statut, pas la clé brute', () => {
    const { racine } = setup('ACTIF', { STATUT_BADGE: { ACTIF: 'Actif', ACTIF_AIDE: 'Le compteur fonctionne normalement.' } });
    expect(racine.textContent).toContain('Actif');
    expect(racine.textContent).not.toContain('STATUT_BADGE.ACTIF');
  });
});
