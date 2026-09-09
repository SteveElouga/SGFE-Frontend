import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { CompteurPlaceCardComponent } from './compteur-place-card.component';
import type { AbonneLigne } from '../../../graphql/vues';
import type { CompteurGeoPoint } from '../carte.model';

const ABONNE = {
  id: 'a1',
  numeroAbonne: 'AB-001',
  nom: 'Mballa',
  prenom: 'Jean',
  statut: 'ACTIF',
  compteur: { id: 'c1', numeroCompteur: 123456, quartier: 'Bonapriso', camp: 1, statut: 'ACTIF' },
} as unknown as AbonneLigne;

const GEO: CompteurGeoPoint = {
  abonneId: 'a1',
  numeroCompteur: 123456,
  quartier: 'Bonapriso',
  statut: 'ACTIF',
  latitude: 4.05,
  longitude: 9.7,
  dateMajPosition: null,
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CompteurPlaceCardComponent],
    providers: [provideRouter([]), provideTranslateService({ lang: 'fr', fallbackLang: 'fr' })],
  });
  const fixture = TestBed.createComponent(CompteurPlaceCardComponent);
  return { fixture, c: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
}

describe('CompteurPlaceCardComponent', () => {
  it('ne rend rien quand fermée', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('open', false);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.detectChanges();
    expect(racine.querySelector('.pc')).toBeNull();
  });

  it('ne rend rien sans abonné, même ouverte', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', null);
    fixture.detectChanges();
    expect(racine.querySelector('.pc')).toBeNull();
  });

  it('affiche les informations du compteur et de l’abonné quand ouverte', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.detectChanges();
    expect(racine.querySelector('.pc')).toBeTruthy();
    expect(racine.textContent).toContain('Bonapriso');
  });

  it('désactive le bouton Itinéraire quand le compteur n’est pas géolocalisé (geo=null)', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.componentRef.setInput('geo', null);
    fixture.detectChanges();
    const bouton = racine.querySelector<HTMLButtonElement>('.pc__action--primaire');
    expect(bouton?.disabled).toBe(true);
  });

  it('active le bouton Itinéraire quand le compteur est géolocalisé', () => {
    const { fixture, racine } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.componentRef.setInput('geo', GEO);
    fixture.detectChanges();
    const bouton = racine.querySelector<HTMLButtonElement>('.pc__action--primaire');
    expect(bouton?.disabled).toBe(false);
  });

  it('émet (close) au clic sur le bouton de fermeture', () => {
    const { fixture, racine, c } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.detectChanges();
    const spy = vi.fn();
    c.close.subscribe(spy);
    racine.querySelector<HTMLButtonElement>('.pc__fermer')?.click();
    expect(spy).toHaveBeenCalled();
  });

  it('émet (demanderItineraire) au clic sur le bouton Itinéraire quand géolocalisé', () => {
    const { fixture, racine, c } = setup();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('abonne', ABONNE);
    fixture.componentRef.setInput('geo', GEO);
    fixture.detectChanges();
    const spy = vi.fn();
    c.demanderItineraire.subscribe(spy);
    racine.querySelector<HTMLButtonElement>('.pc__action--primaire')?.click();
    expect(spy).toHaveBeenCalled();
  });
});
