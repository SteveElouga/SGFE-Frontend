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
            snapshot: {
              paramMap: {
                get: (k: string) => (k === 'token' ? token : k === 'sessionId' ? sessionId : null),
              },
            },
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
});
