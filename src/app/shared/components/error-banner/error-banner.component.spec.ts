import { TestBed } from '@angular/core/testing';
import { ErrorBannerComponent } from './error-banner.component';

describe('ErrorBannerComponent', () => {
  function setup(inputs: Partial<{ message: string; retryLabel: string; showRetry: boolean }> = {}) {
    TestBed.configureTestingModule({ imports: [ErrorBannerComponent] });
    const fixture = TestBed.createComponent(ErrorBannerComponent);
    fixture.componentRef.setInput('message', inputs.message ?? 'Le chargement a échoué.');
    if (inputs.retryLabel !== undefined) fixture.componentRef.setInput('retryLabel', inputs.retryLabel);
    if (inputs.showRetry !== undefined) fixture.componentRef.setInput('showRetry', inputs.showRetry);
    fixture.detectChanges();
    return { fixture, racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le message fourni', () => {
    const { racine } = setup({ message: 'Impossible de charger les abonnés.' });
    expect(racine.textContent).toContain('Impossible de charger les abonnés.');
  });

  it('affiche le bouton réessayer par défaut, avec son libellé par défaut', () => {
    const { racine } = setup();
    const bouton = racine.querySelector('button');
    expect(bouton?.textContent).toContain('Réessayer');
  });

  it('masque le bouton réessayer quand demandé', () => {
    const { racine } = setup({ showRetry: false });
    expect(racine.querySelector('button')).toBeNull();
  });

  it('utilise le libellé de réessai personnalisé', () => {
    const { racine } = setup({ retryLabel: 'Relancer' });
    expect(racine.querySelector('button')?.textContent).toContain('Relancer');
  });

  it('émet retry au clic du bouton', () => {
    const { fixture, racine } = setup();
    const recu: void[] = [];
    fixture.componentInstance.retry.subscribe(() => recu.push(undefined));
    (racine.querySelector('button') as HTMLButtonElement).click();
    expect(recu).toHaveLength(1);
  });
});
