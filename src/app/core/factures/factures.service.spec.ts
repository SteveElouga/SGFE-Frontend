import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import {
  GET_ALL_ENVOIS,
  GET_AVOIR_ABONNE,
  GET_ENVOIS,
  GET_FACTURE,
  GET_FACTURES,
  GET_FACTURES_COUNT,
  GET_FACTURES_PAR_CAMPAGNE,
  GET_PAIEMENTS,
  GET_SOLDE_FACTURE,
  GET_TARIF_ACTUEL,
} from '../../graphql/queries/factures.queries';
import {
  GET_ALL_PAIEMENTS,
  GET_DETTE_ABONNE,
  GET_IMPAYES,
  GET_SUIVI_IMPAYE,
} from '../../graphql/queries/paiements.queries';
import {
  ANNULER_FACTURE,
  ANNULER_PAIEMENT,
  CREDITER_AVOIR,
  ENREGISTRER_PAIEMENT,
  ENREGISTRER_PAIEMENT_ABONNE,
  ENVOYER_FACTURE_WHATSAPP,
  ENVOYER_RECU_PAIEMENT,
  ENVOYER_TOUTES_FACTURES_WHATSAPP,
  GENERER_FACTURES,
  REGENERER_FACTURE,
  RENVOYER_ENVOI,
  RENVOYER_FACTURE_WHATSAPP,
  UPDATE_STATUT_FACTURE,
  UPDATE_TARIF,
} from '../../graphql/mutations/factures.mutations';
import { CREER_REGULARISATION } from '../../graphql/mutations/factures.mutations';
import { EnregistrerPaiementInput } from '../../shared/models/facture.model';
import { FacturesService } from './factures.service';

describe('FacturesService', () => {
  function setup() {
    const querySpy = vi.fn();
    const mutateSpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Apollo, useValue: { query: querySpy, mutate: mutateSpy } }],
    });
    return { service: TestBed.inject(FacturesService), querySpy, mutateSpy };
  }

  // ── Lectures simples ─────────────────────────────────────────────────────────

  it('getFacturesParCampagne interroge en network-only', async () => {
    const { service, querySpy } = setup();
    const factures = [{ factureId: 'f1' }];
    querySpy.mockReturnValue(of({ data: { facturesParCampagne: factures } }));
    const res = await service.getFacturesParCampagne('c1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_FACTURES_PAR_CAMPAGNE, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(factures);
  });

  it('getFacture rend la facture demandée', async () => {
    const { service, querySpy } = setup();
    const facture = { factureId: 'f1', montant: 10_000 };
    querySpy.mockReturnValue(of({ data: { facture } }));
    const res = await service.getFacture('f1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_FACTURE, variables: { factureId: 'f1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(facture);
  });

  it('getFacture propage une erreur GraphQL', async () => {
    const { service, querySpy } = setup();
    const err = new CombinedGraphQLErrors({ errors: [{ message: 'NOT_FOUND' }] } as never);
    querySpy.mockReturnValue(throwError(() => err));
    await expect(service.getFacture('inconnue')).rejects.toBe(err);
  });

  it('getAvoirAbonne rend l’avoir et son journal', async () => {
    const { service, querySpy } = setup();
    const avoir = { solde: 5_000, journal: [] };
    querySpy.mockReturnValue(of({ data: { avoirAbonne: avoir } }));
    const res = await service.getAvoirAbonne('a1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_AVOIR_ABONNE, variables: { abonneId: 'a1' } });
    expect(res).toBe(avoir);
  });

  it('getSoldeFacture interroge en network-only', async () => {
    const { service, querySpy } = setup();
    const solde = { soldeRestant: 2_000 };
    querySpy.mockReturnValue(of({ data: { soldeFacture: solde } }));
    const res = await service.getSoldeFacture('f1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_SOLDE_FACTURE, variables: { factureId: 'f1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(solde);
  });

  it('getPaiements rend les paiements de la facture', async () => {
    const { service, querySpy } = setup();
    const paiements = [{ paiementId: 'p1' }];
    querySpy.mockReturnValue(of({ data: { paiements } }));
    const res = await service.getPaiements('f1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_PAIEMENTS, variables: { factureId: 'f1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(paiements);
  });

  it('getEnvois rend les envois de la facture', async () => {
    const { service, querySpy } = setup();
    const envois = [{ envoiId: 'e1' }];
    querySpy.mockReturnValue(of({ data: { envois } }));
    const res = await service.getEnvois('f1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_ENVOIS, variables: { factureId: 'f1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(envois);
  });

  it('getAllEnvois rend l’historique global des envois', async () => {
    const { service, querySpy } = setup();
    const envois = [{ envoiId: 'e1' }, { envoiId: 'e2' }];
    querySpy.mockReturnValue(of({ data: { envois } }));
    const res = await service.getAllEnvois();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_ALL_ENVOIS, fetchPolicy: 'network-only' });
    expect(res).toBe(envois);
  });

  it('getAllPaiements rend tous les paiements', async () => {
    const { service, querySpy } = setup();
    const paiements = [{ paiementId: 'p1' }];
    querySpy.mockReturnValue(of({ data: { paiements } }));
    const res = await service.getAllPaiements();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_ALL_PAIEMENTS, fetchPolicy: 'network-only' });
    expect(res).toBe(paiements);
  });

  it('getImpayes rend la file des impayés', async () => {
    const { service, querySpy } = setup();
    const impayes = [{ factureId: 'f1', soldeRestant: 3_000 }];
    querySpy.mockReturnValue(of({ data: { impayes } }));
    const res = await service.getImpayes();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_IMPAYES, fetchPolicy: 'network-only' });
    expect(res).toBe(impayes);
  });

  it('getSuiviImpaye rend l’escalade des relances', async () => {
    const { service, querySpy } = setup();
    const suivi = { niveauRelance: 2 };
    querySpy.mockReturnValue(of({ data: { suiviImpaye: suivi } }));
    const res = await service.getSuiviImpaye('f1');
    expect(querySpy).toHaveBeenCalledWith({ query: GET_SUIVI_IMPAYE, variables: { factureId: 'f1' }, fetchPolicy: 'network-only' });
    expect(res).toBe(suivi);
  });

  it('getDetteAbonne transmet horsFactureId=null quand non fourni', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: { detteAbonne: 0 } }));
    await service.getDetteAbonne('a1');
    expect(querySpy).toHaveBeenCalledWith({
      query: GET_DETTE_ABONNE, variables: { abonneId: 'a1', horsFactureId: null }, fetchPolicy: 'network-only',
    });
  });

  it('getDetteAbonne transmet horsFactureId quand fourni', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: { detteAbonne: 4_000 } }));
    const res = await service.getDetteAbonne('a1', 'f-exclue');
    expect(querySpy).toHaveBeenCalledWith({
      query: GET_DETTE_ABONNE, variables: { abonneId: 'a1', horsFactureId: 'f-exclue' }, fetchPolicy: 'network-only',
    });
    expect(res).toBe(4_000);
  });

  it('getTarifActuel rend le tarif courant', async () => {
    const { service, querySpy } = setup();
    const tarif = { prixM3: 500, dateEffet: '2026-01-01' };
    querySpy.mockReturnValue(of({ data: { tarifActuel: tarif } }));
    const res = await service.getTarifActuel();
    expect(querySpy).toHaveBeenCalledWith({ query: GET_TARIF_ACTUEL, fetchPolicy: 'network-only' });
    expect(res).toBe(tarif);
  });

  it('getFacturesCount transmet les filtres', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: { facturesCount: 12 } }));
    const res = await service.getFacturesCount({ statut: 'IMPAYEE' });
    expect(querySpy).toHaveBeenCalledWith({ query: GET_FACTURES_COUNT, variables: { statut: 'IMPAYEE' }, fetchPolicy: 'network-only' });
    expect(res).toBe(12);
  });

  it('getFacturesCount rend 0 quand la réponse est vide', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: null }));
    expect(await service.getFacturesCount()).toBe(0);
  });

  // ── getFactures : cache mémoire 30s ────────────────────────────────────────

  describe('getFactures (cache 30s)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('interroge le réseau et rend les factures', async () => {
      const { service, querySpy } = setup();
      const factures = [{ factureId: 'f1' }];
      querySpy.mockReturnValue(of({ data: { factures } }));
      const res = await service.getFactures({ campagneId: 'c1' });
      expect(querySpy).toHaveBeenCalledWith({ query: GET_FACTURES, variables: { campagneId: 'c1' }, fetchPolicy: 'network-only' });
      expect(res).toBe(factures);
    });

    it('sert le cache pour les mêmes filtres dans les 30s', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: { factures: [{ factureId: 'f1' }] } }));
      await service.getFactures({ campagneId: 'c1' });
      await service.getFactures({ campagneId: 'c1' });
      expect(querySpy).toHaveBeenCalledTimes(1);
    });

    it('re-fetch pour des filtres différents (clé de cache distincte)', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: { factures: [] } }));
      await service.getFactures({ campagneId: 'c1' });
      await service.getFactures({ campagneId: 'c2' });
      expect(querySpy).toHaveBeenCalledTimes(2);
    });

    it('re-fetch après expiration du TTL', async () => {
      const { service, querySpy } = setup();
      querySpy.mockReturnValue(of({ data: { factures: [] } }));
      await service.getFactures({ campagneId: 'c1' });
      vi.advanceTimersByTime(30_001);
      await service.getFactures({ campagneId: 'c1' });
      expect(querySpy).toHaveBeenCalledTimes(2);
    });

    it('une mutation qui modifie les factures invalide le cache', async () => {
      const { service, querySpy, mutateSpy } = setup();
      querySpy.mockReturnValue(of({ data: { factures: [] } }));
      await service.getFactures({ campagneId: 'c1' });
      expect(querySpy).toHaveBeenCalledTimes(1);

      mutateSpy.mockReturnValue(of({ data: { annulerFacture: { factureId: 'f1', statut: 'ANNULEE' } } }));
      await service.annulerFacture('f1', 'Erreur de saisie');

      await service.getFactures({ campagneId: 'c1' });
      expect(querySpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── Mutations qui invalident le cache des factures ──────────────────────────

  it('annulerFacture transmet le motif et rend la facture annulée', async () => {
    const { service, mutateSpy } = setup();
    const facture = { factureId: 'f1', statut: 'ANNULEE' };
    mutateSpy.mockReturnValue(of({ data: { annulerFacture: facture } }));
    const res = await service.annulerFacture('f1', 'Erreur de saisie');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: ANNULER_FACTURE, variables: { factureId: 'f1', motif: 'Erreur de saisie' } });
    expect(res).toBe(facture);
  });

  it('annulerPaiement transmet le motif et rend le paiement annulé', async () => {
    const { service, mutateSpy } = setup();
    const paiement = { paiementId: 'p1', annule: true };
    mutateSpy.mockReturnValue(of({ data: { annulerPaiement: paiement } }));
    const res = await service.annulerPaiement('p1', 'Saisie erronée');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: ANNULER_PAIEMENT, variables: { paiementId: 'p1', motif: 'Saisie erronée' } });
    expect(res).toBe(paiement);
  });

  it('annulerPaiement propage le refus backend d’une seconde annulation', async () => {
    const { service, mutateSpy } = setup();
    const err = new CombinedGraphQLErrors({ errors: [{ message: 'Paiement déjà annulé' }] } as never);
    mutateSpy.mockReturnValue(throwError(() => err));
    await expect(service.annulerPaiement('p1', 'x')).rejects.toBe(err);
  });

  it('crediterAvoir transmet abonné, montant et motif', async () => {
    const { service, mutateSpy } = setup();
    const avoir = { solde: 4_000 };
    mutateSpy.mockReturnValue(of({ data: { crediterAvoir: avoir } }));
    const res = await service.crediterAvoir('a1', 4_000, 'Geste commercial');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: CREDITER_AVOIR, variables: { abonneId: 'a1', montant: 4_000, motif: 'Geste commercial' } });
    expect(res).toBe(avoir);
  });

  it('regenererFacture transmet le motif et rend la facture corrigée', async () => {
    const { service, mutateSpy } = setup();
    const facture = { factureId: 'f2', montant: 9_500 };
    mutateSpy.mockReturnValue(of({ data: { regenererFacture: facture } }));
    const res = await service.regenererFacture('f1', 'Index corrigé');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: REGENERER_FACTURE, variables: { factureId: 'f1', motif: 'Index corrigé' } });
    expect(res).toBe(facture);
  });

  it('genererFactures transmet la campagne et l’option d’envoi auto', async () => {
    const { service, mutateSpy } = setup();
    const rapport = { nbGenerees: 10 };
    mutateSpy.mockReturnValue(of({ data: { genererFactures: rapport } }));
    const res = await service.genererFactures('c1', true);
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: GENERER_FACTURES, variables: { campagneId: 'c1', envoyerWhatsappAuto: true } });
    expect(res).toBe(rapport);
  });

  it('envoyerToutesFacturesWhatsapp mute sans rendre de valeur', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: {} }));
    await expect(service.envoyerToutesFacturesWhatsapp('c1')).resolves.toBeUndefined();
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: ENVOYER_TOUTES_FACTURES_WHATSAPP, variables: { campagneId: 'c1' } });
  });

  it('envoyerFactureWhatsapp transmet facture et abonné', async () => {
    const { service, mutateSpy } = setup();
    const envoi = { envoiId: 'e1', statut: 'ENVOYE' };
    mutateSpy.mockReturnValue(of({ data: { envoyerFactureWhatsapp: envoi } }));
    const res = await service.envoyerFactureWhatsapp('f1', 'a1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: ENVOYER_FACTURE_WHATSAPP, variables: { factureId: 'f1', abonneId: 'a1' } });
    expect(res).toBe(envoi);
  });

  it('renvoyerFactureWhatsapp transmet la facture', async () => {
    const { service, mutateSpy } = setup();
    const envoi = { envoiId: 'e2' };
    mutateSpy.mockReturnValue(of({ data: { renvoyerFactureWhatsapp: envoi } }));
    const res = await service.renvoyerFactureWhatsapp('f1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: RENVOYER_FACTURE_WHATSAPP, variables: { factureId: 'f1' } });
    expect(res).toBe(envoi);
  });

  it('renvoyerEnvoi rejoue un envoi précis par son id', async () => {
    const { service, mutateSpy } = setup();
    const envoi = { envoiId: 'e1', statut: 'ENVOYE' };
    mutateSpy.mockReturnValue(of({ data: { renvoyerEnvoi: envoi } }));
    const res = await service.renvoyerEnvoi('e1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: RENVOYER_ENVOI, variables: { envoiId: 'e1' } });
    expect(res).toBe(envoi);
  });

  it('envoyerRecuPaiement transmet paiement, facture et abonné', async () => {
    const { service, mutateSpy } = setup();
    const envoi = { envoiId: 'e3' };
    mutateSpy.mockReturnValue(of({ data: { envoyerRecuPaiement: envoi } }));
    const res = await service.envoyerRecuPaiement('p1', 'f1', 'a1');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: ENVOYER_RECU_PAIEMENT, variables: { paiementId: 'p1', factureId: 'f1', abonneId: 'a1' } });
    expect(res).toBe(envoi);
  });

  it('enregistrerPaiement déplie l’input en variables individuelles', async () => {
    const { service, mutateSpy } = setup();
    const paiement = { paiementId: 'p1', montant: 5_000 };
    mutateSpy.mockReturnValue(of({ data: { enregistrerPaiement: paiement } }));
    const input: EnregistrerPaiementInput = {
      factureId: 'f1', abonneId: 'a1', montant: 5_000, datePaiement: '2026-08-27', modePaiement: 'ESPECES', referenceTransaction: 'R-1',
    };
    const res = await service.enregistrerPaiement(input);
    expect(mutateSpy).toHaveBeenCalledWith({
      mutation: ENREGISTRER_PAIEMENT,
      variables: {
        factureId: 'f1', abonneId: 'a1', montant: 5_000, datePaiement: '2026-08-27',
        modePaiement: 'ESPECES', referenceTransaction: 'R-1',
      },
    });
    expect(res).toBe(paiement);
  });

  it('updateStatutFacture transmet le nouveau statut', async () => {
    const { service, mutateSpy } = setup();
    const facture = { factureId: 'f1', statut: 'PAYEE' };
    mutateSpy.mockReturnValue(of({ data: { updateStatutFacture: facture } }));
    const res = await service.updateStatutFacture('f1', 'PAYEE');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: UPDATE_STATUT_FACTURE, variables: { factureId: 'f1', statut: 'PAYEE' } });
    expect(res).toBe(facture);
  });

  it('updateTarif transmet le nouveau prix et sa date d’effet (pas d’invalidation du cache factures)', async () => {
    const { service, mutateSpy } = setup();
    const tarif = { prixM3: 550, dateEffet: '2026-09-01' };
    mutateSpy.mockReturnValue(of({ data: { updateTarif: tarif } }));
    const res = await service.updateTarif(550, '2026-09-01');
    expect(mutateSpy).toHaveBeenCalledWith({ mutation: UPDATE_TARIF, variables: { prixM3: 550, dateEffet: '2026-09-01' } });
    expect(res).toBe(tarif);
  });

  // ── Régularisation et paiement global abonné ────────────────────────────────

  describe('creerRegularisation', () => {
    it('transmet dateLimitePaiement=null quand non fournie, et rafraîchit les factures de l’abonné', async () => {
      const { service, mutateSpy } = setup();
      const facture = { factureId: 'f-reg', nature: 'REGULARISATION' };
      mutateSpy.mockReturnValue(of({ data: { creerRegularisation: facture } }));

      const res = await service.creerRegularisation({ abonneId: 'a1', montant: 15_000, motif: 'Arriéré' });

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: CREER_REGULARISATION,
        variables: { abonneId: 'a1', montant: 15_000, motif: 'Arriéré', dateLimitePaiement: null },
        refetchQueries: [{ query: GET_FACTURES, variables: { abonneId: 'a1' } }],
        awaitRefetchQueries: true,
      });
      expect(res).toBe(facture);
    });

    it('lève une erreur explicite quand la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(
        service.creerRegularisation({ abonneId: 'a1', montant: 1_000, motif: 'x' }),
      ).rejects.toThrow('Réponse invalide du serveur');
    });
  });

  describe('enregistrerPaiementAbonne', () => {
    it('rend la ventilation réelle (une écriture par facture touchée)', async () => {
      const { service, mutateSpy } = setup();
      const ventilation = { paiements: [{ factureId: 'f1', part: 5_000 }, { factureId: 'f2', part: 2_000 }] };
      mutateSpy.mockReturnValue(of({ data: { enregistrerPaiementAbonne: ventilation } }));

      const res = await service.enregistrerPaiementAbonne({
        abonneId: 'a1', montant: 7_000, datePaiement: '2026-08-27', modePaiement: 'ESPECES',
      });

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: ENREGISTRER_PAIEMENT_ABONNE,
        variables: { abonneId: 'a1', montant: 7_000, datePaiement: '2026-08-27', modePaiement: 'ESPECES', referenceTransaction: '' },
      });
      expect(res).toBe(ventilation);
    });

    it('lève une erreur explicite quand la réponse est vide', async () => {
      const { service, mutateSpy } = setup();
      mutateSpy.mockReturnValue(of({ data: null }));
      await expect(
        service.enregistrerPaiementAbonne({ abonneId: 'a1', montant: 1, datePaiement: 'x', modePaiement: 'ESPECES' }),
      ).rejects.toThrow('Réponse invalide du serveur');
    });
  });

  // ── previsualiserImputation : fonction pure, imputation FIFO ────────────────

  describe('previsualiserImputation', () => {
    it('impute du solde le plus anciennement exigible au plus récent', () => {
      const { service } = setup();
      const soldes = [
        { factureId: 'recent', numeroFacture: 'F-2', soldeRestant: 5_000, dateLimitePaiement: '2026-09-01' },
        { factureId: 'vieux', numeroFacture: 'F-1', soldeRestant: 3_000, dateLimitePaiement: '2026-08-01' },
      ];
      const parts = service.previsualiserImputation(6_000, soldes);
      expect(parts).toEqual([
        { factureId: 'vieux', numeroFacture: 'F-1', part: 3_000, dateLimitePaiement: '2026-08-01' },
        { factureId: 'recent', numeroFacture: 'F-2', part: 3_000, dateLimitePaiement: '2026-09-01' },
      ]);
    });

    it('ignore les soldes déjà réglés (soldeRestant <= 0)', () => {
      const { service } = setup();
      const soldes = [
        { factureId: 'payee', numeroFacture: 'F-0', soldeRestant: 0, dateLimitePaiement: '2026-07-01' },
        { factureId: 'due', numeroFacture: 'F-1', soldeRestant: 2_000, dateLimitePaiement: '2026-08-01' },
      ];
      const parts = service.previsualiserImputation(2_000, soldes);
      expect(parts.map((p) => p.factureId)).toEqual(['due']);
    });

    it('s’arrête dès que le montant est entièrement imputé', () => {
      const { service } = setup();
      const soldes = [
        { factureId: 'a', numeroFacture: 'F-1', soldeRestant: 3_000, dateLimitePaiement: '2026-08-01' },
        { factureId: 'b', numeroFacture: 'F-2', soldeRestant: 3_000, dateLimitePaiement: '2026-08-02' },
      ];
      const parts = service.previsualiserImputation(1_000, soldes);
      expect(parts).toEqual([{ factureId: 'a', numeroFacture: 'F-1', part: 1_000, dateLimitePaiement: '2026-08-01' }]);
    });

    it('un montant de zéro ne produit aucune part', () => {
      const { service } = setup();
      const soldes = [{ factureId: 'a', numeroFacture: 'F-1', soldeRestant: 3_000, dateLimitePaiement: '2026-08-01' }];
      expect(service.previsualiserImputation(0, soldes)).toEqual([]);
    });

    it('une échéance absente passe en dernier plutôt que de faire échouer le calcul', () => {
      const { service } = setup();
      const soldes = [
        { factureId: 'sans-echeance', numeroFacture: 'F-0', soldeRestant: 1_000, dateLimitePaiement: '' },
        { factureId: 'avec-echeance', numeroFacture: 'F-1', soldeRestant: 1_000, dateLimitePaiement: '2026-08-01' },
      ];
      const parts = service.previsualiserImputation(2_000, soldes);
      expect(parts.map((p) => p.factureId)).toEqual(['avec-echeance', 'sans-echeance']);
    });

    it('une liste vide ne produit aucune part', () => {
      const { service } = setup();
      expect(service.previsualiserImputation(1_000, [])).toEqual([]);
    });
  });
});
