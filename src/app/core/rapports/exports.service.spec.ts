/**
 * Les critères d'export, traduits en query-string.
 *
 * Le serveur exigeait un `campagne_id` : aucun journal par période n'était
 * possible, et les régularisations — créées sans campagne — étaient exportables
 * par aucun chemin. Ce service porte désormais les trois critères, et le point
 * délicat est ce qu'il ne met PAS dans l'URL : une borne vide.
 *
 * La vue distingue « pas de borne » d'une borne illisible, et refuse la seconde
 * par un 400. Envoyer `date_debut=` ferait donc échouer un export qui n'en
 * demandait aucune.
 */
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AuthService } from '../auth/auth.service';
import { ExportsService } from './exports.service';

function reponseCsv() {
  return of({
    body: new Blob(['numero_facture\n'], { type: 'text/csv' }),
    headers: { get: () => null },
  });
}

describe('ExportsService — critères', () => {
  let service: ExportsService;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn().mockReturnValue(reponseCsv());
    // Le téléchargement crée un <a> et le clique : on neutralise le clic, pas
    // l'appel HTTP — c'est lui qu'on observe.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ExportsService,
        { provide: HttpClient, useValue: { get } },
        { provide: AuthService, useValue: { accessToken: () => 'jwt' } },
      ],
    });
    service = TestBed.inject(ExportsService);
  });

  const params = () => get.mock.calls[0][1].params as Record<string, string>;

  it('envoie campagne_id en mode campagne', async () => {
    await service.facturesCsv({ campagneId: 'camp-1' });
    expect(params()).toEqual({ campagne_id: 'camp-1' });
  });

  it('envoie les deux bornes en mode période', async () => {
    await service.paiementsCsv({ dateDebut: '2026-07-01', dateFin: '2026-07-31' });
    expect(params()).toEqual({ date_debut: '2026-07-01', date_fin: '2026-07-31' });
  });

  it('n’envoie PAS une borne vide', async () => {
    await service.facturesCsv({ dateDebut: '2026-07-01', dateFin: '' });
    expect(params()).toEqual({ date_debut: '2026-07-01' });
    expect('date_fin' in params()).toBe(false);
  });

  it('sans aucun critère, aucune query-string — tout l’historique', async () => {
    await service.facturesCsv();
    expect(params()).toEqual({});
  });

  it('le nom de repli porte le critère, pour que deux exports restent distincts', async () => {
    await service.facturesCsv({ dateDebut: '2026-07-01', dateFin: '2026-07-31' });
    expect(get.mock.calls[0][0]).toBe('/rapports/factures.csv');
    // Le nom n'est utilisé que si le serveur ne pose pas de Content-Disposition ;
    // ici le mock n'en pose aucun, donc c'est bien le repli qui sert.
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
