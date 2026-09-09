import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import fr from '../../../../../public/i18n/fr.json';
import { EspaceAbonnePaiementConfirmationComponent } from './espace-abonne-paiement-confirmation.component';
import { EspaceAbonneService } from '../../../core/espace-abonne/espace-abonne.service';

/**
 * Cet écran est un MOCK/SANDBOX de démonstration (décision d'audit §10.2
 * levée) : aucune vraie passerelle de paiement n'est branchée derrière. Il
 * doit toujours annoncer clairement la simulation, appeler le bon endpoint
 * avec le token/sessionId de la route, et refléter fidèlement le statut
 * renvoyé par le backend — sans jamais laisser croire à un paiement réel.
 */
describe('EspaceAbonnePaiementConfirmationComponent', () => {
  function setup(token = 'tok-1', sessionId = 'sess-1') {
    const svc = {
      confirmerPaiementEnLigne: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [EspaceAbonnePaiementConfirmationComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ token, sessionId }),
          },
        },
      ],
    });

    // Les vraies chaînes françaises, pas les clés : le bandeau « mode
    // démonstration » doit être lisible, pas juste présent dans le DOM sous
    // sa clé i18n. Charger le fichier réel fait tomber le test si la clé
    // ESPACE.PAIEMENT.* venait à manquer.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(EspaceAbonnePaiementConfirmationComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, svc };
  }

  it('lit le token et le sessionId depuis la route', () => {
    const { component } = setup('tok-abc', 'sess-xyz');
    expect(component.token).toBe('tok-abc');
    expect(component.sessionId).toBe('sess-xyz');
  });

  it("affiche un bouton de confirmation à l'état initial", () => {
    const { fixture } = setup();
    const bouton = fixture.nativeElement.querySelector('.pc-btn');
    expect(bouton).not.toBeNull();
  });

  it('annonce la simulation de paiement (mode démonstration)', () => {
    const { fixture } = setup();
    const bandeau = fixture.nativeElement.querySelector('.pc-bandeau');
    expect(bandeau).not.toBeNull();
    expect(bandeau.textContent).toContain('démonstration');
  });

  it('appelle confirmerPaiementEnLigne avec le token et la session de la route', () => {
    const { component, svc } = setup('tok-1', 'sess-1');
    svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'CONFIRMEE' }));

    component.confirmer();

    expect(svc.confirmerPaiementEnLigne).toHaveBeenCalledWith('tok-1', 'sess-1');
  });

  it('affiche le résultat CONFIRMEE renvoyé par le backend', () => {
    const { component, svc } = setup();
    svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'CONFIRMEE' }));

    component.confirmer();

    expect(component.etat()).toBe('confirmee');
  });

  it('affiche le résultat ECHOUEE renvoyé par le backend', () => {
    const { component, svc } = setup();
    svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'ECHOUEE' }));

    component.confirmer();

    expect(component.etat()).toBe('echouee');
  });

  it('affiche le résultat EXPIREE renvoyé par le backend', () => {
    const { component, svc } = setup();
    svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'EXPIREE' }));

    component.confirmer();

    expect(component.etat()).toBe('expiree');
  });

  it('bascule en erreur si l’appel réseau échoue', () => {
    const { component, svc } = setup();
    svc.confirmerPaiementEnLigne.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );

    component.confirmer();

    expect(component.etat()).toBe('erreur');
  });

  it('ignore un second clic pendant la confirmation en cours', () => {
    const { component, svc } = setup();
    // Observable jamais résolu : simule un appel réseau encore en vol.
    svc.confirmerPaiementEnLigne.mockReturnValue({ subscribe: () => undefined } as never);

    component.confirmer();
    expect(component.etat()).toBe('confirmation');

    component.confirmer();
    expect(svc.confirmerPaiementEnLigne).toHaveBeenCalledTimes(1);
  });

  it("propose un lien de retour vers l'espace abonné du token courant", () => {
    const { component } = setup('tok-retour', 'sess-1');
    expect(component.retourVers()).toBe('/espace/tok-retour');
  });

  // ── Rendu réel du template selon l'état (le `@switch` a 6 branches, une
  //    seule — 'attente' — était jamais rendue par les tests ci-dessus, qui
  //    lisent `component.etat()` sans jamais rappeler `detectChanges()`) ────

  describe('rendu du template selon l’état', () => {
    it('rend l’état "en cours" (spinner, bouton disparu) pendant la confirmation', () => {
      const { component, fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue({ subscribe: () => undefined } as never);

      component.confirmer();
      fixture.detectChanges();

      const etatEl = fixture.nativeElement.querySelector('.pc-etat');
      expect(etatEl).not.toBeNull();
      expect(etatEl.textContent).toContain('Paiement en cours');
      expect(fixture.nativeElement.querySelector('.pc-btn')).toBeNull();
    });

    it('rend la confirmation réussie avec role="status" et le libellé exact', () => {
      const { component, fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'CONFIRMEE' }));

      component.confirmer();
      fixture.detectChanges();

      const etatEl = fixture.nativeElement.querySelector('.pc-etat--ok');
      expect(etatEl).not.toBeNull();
      expect(etatEl.getAttribute('role')).toBe('status');
      expect(etatEl.textContent).toContain('Paiement confirmé');
    });

    it('rend l’échec avec role="alert" et le libellé exact', () => {
      const { component, fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'ECHOUEE' }));

      component.confirmer();
      fixture.detectChanges();

      const etatEl = fixture.nativeElement.querySelector('.pc-etat--danger');
      expect(etatEl).not.toBeNull();
      expect(etatEl.getAttribute('role')).toBe('alert');
      expect(etatEl.textContent).toContain('a échoué');
    });

    it('rend l’expiration de la session avec son libellé propre', () => {
      const { component, fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'EXPIREE' }));

      component.confirmer();
      fixture.detectChanges();

      const etatEl = fixture.nativeElement.querySelector('.pc-etat--warn');
      expect(etatEl).not.toBeNull();
      expect(etatEl.textContent).toContain('expiré');
    });

    it('rend l’état erreur réseau — distinct du texte "échoué" (cause différente)', () => {
      const { component, fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );

      component.confirmer();
      fixture.detectChanges();

      const etatEl = fixture.nativeElement.querySelector('.pc-etat--danger[role="alert"]');
      expect(etatEl).not.toBeNull();
      expect(etatEl.textContent).toContain('n\'a pas pu être lancé');
    });

    it('le lien de retour rendu dans le DOM pointe vers l’espace du token courant', () => {
      const { fixture } = setup('tok-retour', 'sess-1');
      const lien = fixture.nativeElement.querySelector('.pc-retour');
      expect(lien.getAttribute('href')).toBe('/espace/tok-retour');
      expect(lien.textContent).toContain('Retour à mes factures');
    });

    it('un vrai clic DOM sur le bouton déclenche confirmer() (pas seulement l’appel direct)', () => {
      const { fixture, svc } = setup();
      svc.confirmerPaiementEnLigne.mockReturnValue(of({ statut: 'CONFIRMEE' }));

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.pc-btn');
      bouton.click();
      fixture.detectChanges();

      expect(svc.confirmerPaiementEnLigne).toHaveBeenCalledWith('tok-1', 'sess-1');
      expect(fixture.nativeElement.querySelector('.pc-etat--ok')).not.toBeNull();
    });
  });

  it('des params de route sans token ni sessionId retombent sur des chaînes vides', () => {
    const svc = { confirmerPaiementEnLigne: vi.fn() };
    TestBed.configureTestingModule({
      imports: [EspaceAbonnePaiementConfirmationComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: EspaceAbonneService, useValue: svc },
        { provide: ActivatedRoute, useValue: { params: of({}) } },
      ],
    });
    const fixture = TestBed.createComponent(EspaceAbonnePaiementConfirmationComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.token).toBe('');
    expect(fixture.componentInstance.sessionId).toBe('');
    expect(fixture.componentInstance.retourVers()).toBe('/espace/');
  });
});
