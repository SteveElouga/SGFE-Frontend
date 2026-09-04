import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { KpiGridComponent } from './kpi-grid.component';

describe('KpiGridComponent', () => {
  function monter(inputs: Partial<{
    consoMoyenne: number | null;
    nbFactures: number;
    soldeKpiClass: string;
    soldeFormate: string;
    soldeSub: string;
    avoir: number;
    avoirFormate: string;
    abonneDepuis: string;
    moisDepuis: string;
    hasSoldesOuverts: boolean;
  }> = {}) {
    TestBed.configureTestingModule({
      imports: [KpiGridComponent],
      providers: [provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
    });
    // Seule cette clé porte un paramètre interpolé ({{montant}}) et doit être
    // vérifiée telle qu'affichée ; les autres libellés ne sont pas testés ici.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', {
      ABONNES: { DETAIL: { AVOIR_DISPONIBLE: '{{montant}} disponibles en avoir' } },
    });
    translate.use('fr');
    const fixture = TestBed.createComponent(KpiGridComponent);
    fixture.componentRef.setInput('consoMoyenne', inputs.consoMoyenne ?? null);
    fixture.componentRef.setInput('nbFactures', inputs.nbFactures ?? 0);
    fixture.componentRef.setInput('soldeKpiClass', inputs.soldeKpiClass ?? '');
    fixture.componentRef.setInput('soldeFormate', inputs.soldeFormate ?? '');
    fixture.componentRef.setInput('soldeSub', inputs.soldeSub ?? '');
    fixture.componentRef.setInput('avoir', inputs.avoir ?? 0);
    fixture.componentRef.setInput('avoirFormate', inputs.avoirFormate ?? '');
    fixture.componentRef.setInput('abonneDepuis', inputs.abonneDepuis ?? '');
    fixture.componentRef.setInput('moisDepuis', inputs.moisDepuis ?? '');
    fixture.componentRef.setInput('hasSoldesOuverts', inputs.hasSoldesOuverts ?? false);
    fixture.detectChanges();
    const racine = fixture.nativeElement as HTMLElement;
    return { fixture, c: fixture.componentInstance, racine };
  }

  it('affiche un tiret quand la consommation moyenne est inconnue', () => {
    const { racine } = monter({ consoMoyenne: null });
    expect(racine.querySelector('.abonne-kpi--blue .abonne-kpi__value')?.textContent?.trim()).toBe('— m³');
  });

  it('affiche la consommation moyenne fournie', () => {
    const { racine } = monter({ consoMoyenne: 18 });
    expect(racine.querySelector('.abonne-kpi--blue .abonne-kpi__value')?.textContent?.trim()).toBe('18 m³');
  });

  it('affiche le nombre de factures et le solde formaté avec sa classe de teinte', () => {
    const { racine } = monter({ nbFactures: 5, soldeKpiClass: 'abonne-kpi--danger', soldeFormate: '12 000 FCFA', soldeSub: 'Impayé' });
    expect(racine.querySelector('.abonne-kpi--green .abonne-kpi__value')?.textContent?.trim()).toBe('5');
    const soldeCard = racine.querySelectorAll('.abonne-kpi')[2];
    expect(soldeCard.classList.contains('abonne-kpi--danger')).toBe(true);
    expect(soldeCard.querySelector('.abonne-kpi__value--solde')?.textContent?.trim()).toBe('12 000 FCFA');
    expect(soldeCard.querySelector('.abonne-kpi__sub')?.textContent?.trim()).toBe('Impayé');
  });

  it('n’affiche pas de mention d’avoir quand il est nul', () => {
    const { racine } = monter({ avoir: 0 });
    expect(racine.querySelector('.abonne-kpi__avoir')).toBeNull();
  });

  it('affiche l’avoir disponible dès qu’il est positif', () => {
    const { racine } = monter({ avoir: 2500, avoirFormate: '2 500 FCFA' });
    expect(racine.querySelector('.abonne-kpi__avoir')?.textContent).toContain('2 500 FCFA');
  });

  it('n’affiche pas le bouton d’encaissement sans solde ouvert', () => {
    const { racine } = monter({ hasSoldesOuverts: false });
    expect(racine.querySelector('.abonne-kpi__action--primaire')).toBeNull();
    // Le bouton « arriéré » reste disponible : il sert aussi à consulter l'historique.
    expect(racine.querySelector('.abonne-kpi__action')).toBeTruthy();
  });

  it('affiche le bouton d’encaissement quand un solde reste ouvert', () => {
    const { racine } = monter({ hasSoldesOuverts: true });
    expect(racine.querySelector('.abonne-kpi__action--primaire')).toBeTruthy();
  });

  it('émet openEncaissement au clic sur le bouton d’encaissement', () => {
    const { racine, c } = monter({ hasSoldesOuverts: true });
    const recu: void[] = [];
    c.openEncaissement.subscribe(() => recu.push(undefined));
    (racine.querySelector('.abonne-kpi__action--primaire') as HTMLButtonElement).click();
    expect(recu).toHaveLength(1);
  });

  it('émet openArriere au clic sur le bouton arriéré, sans déclencher openEncaissement', () => {
    const { racine, c } = monter({ hasSoldesOuverts: true });
    const arriere: void[] = [];
    const encaissement: void[] = [];
    c.openArriere.subscribe(() => arriere.push(undefined));
    c.openEncaissement.subscribe(() => encaissement.push(undefined));
    const boutons = racine.querySelectorAll('.abonne-kpi__action');
    (boutons[boutons.length - 1] as HTMLButtonElement).click();
    expect(arriere).toHaveLength(1);
    expect(encaissement).toHaveLength(0);
  });

  it('affiche l’ancienneté de l’abonné', () => {
    const { racine } = monter({ abonneDepuis: 'Depuis 2022', moisDepuis: '36 mois' });
    const card = racine.querySelectorAll('.abonne-kpi')[3];
    expect(card.querySelector('.abonne-kpi__value')?.textContent?.trim()).toBe('Depuis 2022');
    expect(card.querySelector('.abonne-kpi__sub')?.textContent?.trim()).toBe('36 mois');
  });
});
