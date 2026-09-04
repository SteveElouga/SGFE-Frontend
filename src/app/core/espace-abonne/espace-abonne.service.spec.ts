import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EspaceAbonneData, EspaceAbonneService } from './espace-abonne.service';

/**
 * Seul service REST (hors GraphQL) de ce lot — accès public tokenisé, sans JWT.
 * Le point sensible : le token voyage dans le CHEMIN, jamais en query string
 * (il ne doit pas fuiter dans les logs d'accès ni l'en-tête Referer). On le
 * vérifie littéralement sur l'URL capturée par `HttpTestingController`, y
 * compris avec un token qui contient des caractères à encoder.
 */
describe('EspaceAbonneService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return {
      service: TestBed.inject(EspaceAbonneService),
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  afterEach(() => {
    // Chaque test déclenche exactement l'appel qu'il vérifie.
  });

  describe('getFactures', () => {
    it('interroge le chemin exact, sans préfixe /api, avec slash final', () => {
      const { service, httpMock } = setup();
      const data: EspaceAbonneData = { abonne_id: 'ab-1', token_expiration: '2026-12-31', factures: [] };

      let recu: EspaceAbonneData | undefined;
      service.getFactures('tok-abc').subscribe((d) => (recu = d));

      const req = httpMock.expectOne('/espace-abonne/tok-abc/');
      expect(req.request.method).toBe('GET');
      req.flush(data);

      expect(recu).toEqual(data);
      httpMock.verify();
    });

    it('encode le token dans le CHEMIN, jamais en query string', () => {
      const { service, httpMock } = setup();
      service.getFactures('tok/avec?caractères&spéciaux').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url.startsWith('/espace-abonne/') && r.url.endsWith('/'),
      );
      // Le token encodé fait partie du CHEMIN : aucun `?` de query string ne
      // doit apparaître dans l'URL construite (celui du token est encodé en %3F).
      expect(req.request.urlWithParams).not.toContain('?token=');
      expect(req.request.urlWithParams.indexOf('?')).toBe(-1);
      expect(req.request.urlWithParams).toContain(encodeURIComponent('tok/avec?caractères&spéciaux'));
      req.flush({ abonne_id: 'x', token_expiration: 'x', factures: [] });
      httpMock.verify();
    });
  });

  describe('pdfUrl', () => {
    it('construit l’URL du PDF avec token et facture encodés dans le chemin', () => {
      const { service } = setup();
      expect(service.pdfUrl('tok-abc', 'f-1')).toBe('/espace-abonne/tok-abc/facture/f-1/pdf/');
    });

    it('encode les caractères spéciaux du token et de l’identifiant de facture', () => {
      const { service } = setup();
      const url = service.pdfUrl('tok/x', 'f?1');
      expect(url).toBe(`/espace-abonne/${encodeURIComponent('tok/x')}/facture/${encodeURIComponent('f?1')}/pdf/`);
      expect(url).not.toContain('?1'); // le '?' du facture_id est bien encodé, pas laissé tel quel
    });
  });

  describe('csvUrl', () => {
    it('construit l’URL du relevé de compte CSV', () => {
      const { service } = setup();
      expect(service.csvUrl('tok-abc')).toBe('/espace-abonne/tok-abc/factures.csv');
    });

    it('encode le token', () => {
      const { service } = setup();
      expect(service.csvUrl('tok/avec/slash')).toBe(`/espace-abonne/${encodeURIComponent('tok/avec/slash')}/factures.csv`);
    });
  });

  describe('creerPaiementEnLigne', () => {
    it('poste facture_id et montant, avec le token dans le chemin', () => {
      const { service, httpMock } = setup();
      let session: unknown;
      service.creerPaiementEnLigne('tok-abc', 'f-1', 5_000).subscribe((s) => (session = s));

      const req = httpMock.expectOne('/espace-abonne/tok-abc/paiement/');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ facture_id: 'f-1', montant: 5_000 });

      const reponse = { session_id: 's-1', url_redirection: '/x', expire_a: '2026-08-28', statut: 'EN_ATTENTE' };
      req.flush(reponse);
      expect(session).toEqual(reponse);
      httpMock.verify();
    });
  });

  describe('confirmerPaiementEnLigne', () => {
    it('poste sans corps, avec le token et l’id de session dans le chemin', () => {
      const { service, httpMock } = setup();
      let confirmation: unknown;
      service.confirmerPaiementEnLigne('tok-abc', 's-1').subscribe((c) => (confirmation = c));

      const req = httpMock.expectOne('/espace-abonne/tok-abc/paiement/s-1/confirmer/');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();

      req.flush({ statut: 'CONFIRMEE' });
      expect(confirmation).toEqual({ statut: 'CONFIRMEE' });
      httpMock.verify();
    });

    it('encode l’id de session dans le chemin', () => {
      const { service, httpMock } = setup();
      service.confirmerPaiementEnLigne('tok-abc', 's/1').subscribe();
      const req = httpMock.expectOne(`/espace-abonne/tok-abc/paiement/${encodeURIComponent('s/1')}/confirmer/`);
      req.flush({ statut: 'CONFIRMEE' });
      httpMock.verify();
    });
  });
});
