import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from '../../services/toast.service';

/**
 * Pile de toasts : reflète `ToastService.toasts` (service réel — simple et
 * sans dépendance lourde, pas besoin de le mocker). Ce qui compte : chaque
 * type de toast s'affiche correctement, dismiss/action délèguent bien au
 * service, et le calcul de progression ne divise jamais par zéro.
 */
describe('ToastContainerComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    const toastService = TestBed.inject(ToastService);
    const fixture = TestBed.createComponent(ToastContainerComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, toastService, racine: fixture.nativeElement as HTMLElement };
  }

  it("n'affiche rien sans toast actif", () => {
    const { racine } = setup();
    expect(racine.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('affiche un toast de succès avec son titre et son message', () => {
    const { fixture, toastService, racine } = setup();
    toastService.success('Paiement enregistré', 'Le reçu a été généré.');
    fixture.detectChanges();
    const toast = racine.querySelector('.toast--success');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('Paiement enregistré');
    expect(toast?.textContent).toContain('Le reçu a été généré.');
    expect(toast?.getAttribute('role')).toBe('status');
  });

  it('un toast d’erreur porte le rôle alert (interruption assertive)', () => {
    const { fixture, toastService, racine } = setup();
    toastService.error('Échec de l’enregistrement');
    fixture.detectChanges();
    const toast = racine.querySelector('.toast--error');
    expect(toast?.getAttribute('role')).toBe('alert');
    expect(toast?.getAttribute('aria-live')).toBe('assertive');
  });

  it('affiche les toasts les plus récents en tête (ordre du service)', () => {
    const { fixture, toastService, racine } = setup();
    toastService.info('Premier');
    toastService.info('Second');
    fixture.detectChanges();
    const titres = [...racine.querySelectorAll('.toast__title')].map((e) => e.textContent);
    expect(titres).toEqual(['Second', 'Premier']);
  });

  it('le bouton de fermeture ferme le toast via le service', () => {
    const { fixture, toastService, racine } = setup();
    const id = toastService.info('À fermer');
    fixture.detectChanges();
    (racine.querySelector('.toast__close') as HTMLButtonElement).click();
    expect(toastService.toasts().some((t) => t.id === id)).toBe(false);
  });

  it('cliquer une action l’exécute puis referme le toast', () => {
    const { fixture, toastService, racine } = setup();
    const handler = vi.fn();
    toastService.show({ type: 'info', title: 'Filtres effacés', actions: [{ label: 'Annuler', handler }] });
    fixture.detectChanges();

    (racine.querySelector('.toast__action') as HTMLButtonElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(toastService.toasts()).toHaveLength(0);
  });

  it('affiche la progression sans bouton de fermeture pour un toast progress', () => {
    const { fixture, toastService, racine } = setup();
    toastService.progress('Import en cours', 3, 10);
    fixture.detectChanges();
    const toast = racine.querySelector('.toast--progress');
    expect(toast?.querySelector('.toast__progress-count')?.textContent).toContain('3');
    expect(toast?.querySelector('.toast__progress-count')?.textContent).toContain('10');
    expect(toast?.querySelector('.toast__close')).toBeNull();
    expect(toast?.querySelector('.toast__timer-track')).toBeNull();
  });

  it('progressPercent arrondit le pourcentage et le plafonne à 100', () => {
    const { c } = setup();
    expect(c.progressPercent({ id: 't', type: 'progress', title: '', current: 3, total: 10 })).toBe(30);
    expect(c.progressPercent({ id: 't', type: 'progress', title: '', current: 12, total: 10 })).toBe(100);
  });

  it("progressPercent vaut 0 sans total (pas de division par zéro)", () => {
    const { c } = setup();
    expect(c.progressPercent({ id: 't', type: 'progress', title: '', total: 0 })).toBe(0);
    expect(c.progressPercent({ id: 't', type: 'progress', title: '' })).toBe(0);
  });

  it('affiche une barre de temporisation pour success/info/warning, pas pour error', () => {
    const { fixture, toastService, racine } = setup();
    toastService.success('S');
    toastService.error('E');
    fixture.detectChanges();
    expect(racine.querySelector('.toast--success .toast__timer-track')).toBeTruthy();
    expect(racine.querySelector('.toast--error .toast__timer-track')).toBeNull();
  });
});
