/**
 * Les cinq flux temps réel branchés — ce qu'ils font des événements reçus.
 *
 * Ces cinq souscriptions existaient des deux côtés, gateway comprise, sans que
 * personne ne les écoute. Un flux déclaré mais débranché est pire qu'absent :
 * il donne à croire que l'écran est vivant alors qu'il est figé.
 *
 * Ce qui est vérifié ici est ce que le navigateur ne rejoue pas tout seul : la
 * forme des données reçues (les souscriptions ne portent qu'un sous-ensemble
 * des champs de leurs listes) et la règle d'arbitrage des écrans de formulaire
 * — une saisie en cours gagne toujours sur un événement distant.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

import { UtilisateursListComponent } from './utilisateurs/list/utilisateurs-list.component';
import { FacturesListComponent } from './facturation/list/factures-list.component';
import { PaiementsListComponent } from './paiements/paiements-list.component';
import { ConfigurationComponent } from './configuration/configuration.component';

import { UsersService } from '../core/users/users.service';
import { FacturesService } from '../core/factures/factures.service';
import { FacturePdfService } from '../core/factures/facture-pdf.service';
import { CampagnesService } from '../core/campagnes/campagnes.service';
import { ConfigurationService } from '../core/configuration/configuration.service';

import { User } from '../shared/models/user.model';
import { Facture, Paiement, Tarif } from '../shared/models/facture.model';
import { ConfigParam, InfosSociete } from '../shared/models/configuration.model';

/** Laisse se résoudre les `await` de `load()` avant que l'écoute ne démarre. */
const laisserChargerPuisEcouter = () => new Promise((r) => setTimeout(r, 0));

const utilisateur = (p: Partial<User> = {}): User => ({
  id: 'u1',
  username: 'demo_agent',
  email: '',
  phoneNumber: '+237600000001',
  role: 'AGENT',
  isActive: true,
  createdAt: '2026-08-26T00:00:00Z',
  ...p,
});

const facture = (p: Partial<Facture> = {}): Facture => ({
  factureId: 'f1',
  numeroFacture: 'FACT-2026-08-0001',
  abonneId: 'a1',
  campagneId: 'c1',
  ancienIndex: 0,
  nouveauIndex: 10,
  consommation: 10,
  prixM3: 500,
  montant: 5000,
  statut: 'IMPAYEE',
  dateReleve: '2026-08-01',
  dateLimitePaiement: '2026-09-01',
  dateGeneration: '2026-08-02',
  pdfPath: '/pdf/f1.pdf',
  numeroMobileMoney: '655000000',
  abonneNom: 'Blandine',
  abonneNumero: 'AB-0007',
  campagneNom: 'Août 2026',
  ...p,
});

describe('Flux temps réel branchés', () => {
  // ────────────────────────────────────────────────────────────────────────
  describe('/utilisateurs — utilisateurUpdated', () => {
    function setup(users: User[]) {
      const flux = new Subject<{ data: { utilisateurUpdated: User } }>();
      TestBed.configureTestingModule({
        imports: [UtilisateursListComponent],
        providers: [
          provideRouter([]),
          ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
          { provide: Apollo, useValue: { subscribe: () => flux.asObservable() } },
          { provide: UsersService, useValue: { getUsers: vi.fn().mockResolvedValue(users) } },
        ],
      });
      const fixture = TestBed.createComponent(UtilisateursListComponent);
      fixture.detectChanges();
      return { component: fixture.componentInstance, flux };
    }

    it('remplace en place un compte déjà listé', async () => {
      const { component, flux } = setup([
        utilisateur(),
        utilisateur({ id: 'u2', username: 'admin' }),
      ]);
      await laisserChargerPuisEcouter();

      flux.next({ data: { utilisateurUpdated: utilisateur({ isActive: false }) } });

      expect(component.users()).toHaveLength(2);
      expect(component.users()[0].isActive).toBe(false);
    });

    it('pose une création en tête — la liste est antichronologique', async () => {
      const { component, flux } = setup([utilisateur()]);
      await laisserChargerPuisEcouter();

      flux.next({ data: { utilisateurUpdated: utilisateur({ id: 'u9', username: 'nouveau' }) } });

      expect(component.users().map((u) => u.username)).toEqual(['nouveau', 'demo_agent']);
    });

    it('n’écoute qu’une fois la liste chargée, sinon le chargement écraserait l’événement', () => {
      const { component } = setup([utilisateur()]);
      // Avant le tour de boucle, la liste est encore vide : rien n'a pu être
      // reçu ni, donc, écrasé.
      expect(component.users()).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('/factures — factureUpdated', () => {
    function setup(factures: Facture[]) {
      const flux = new Subject<{ data: { factureUpdated: Partial<Facture> } }>();
      TestBed.configureTestingModule({
        imports: [FacturesListComponent],
        providers: [
          provideRouter([]),
          ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
          { provide: ActivatedRoute, useValue: { snapshot: { params: { campagneId: 'c1' } } } },
          { provide: Apollo, useValue: { subscribe: () => flux.asObservable() } },
          {
            provide: FacturesService,
            useValue: {
              getFacturesParCampagne: vi.fn().mockResolvedValue(factures),
              getFactures: vi.fn().mockResolvedValue(factures),
              getSoldeFacture: vi.fn().mockResolvedValue({ soldeRestant: 2000 }),
              getDetteAbonne: vi
                .fn()
                .mockResolvedValue({ totalDu: 2000, nbFactures: 1, plusAncienneEcheance: null }),
            },
          },
          { provide: FacturePdfService, useValue: {} },
          { provide: CampagnesService, useValue: { getCampagne: vi.fn().mockResolvedValue(null) } },
        ],
      });
      const fixture = TestBed.createComponent(FacturesListComponent);
      fixture.detectChanges();
      return { component: fixture.componentInstance, flux };
    }

    it('fusionne sans mutiler : la souscription ne porte pas les libellés enrichis', async () => {
      const { component, flux } = setup([facture()]);
      await laisserChargerPuisEcouter();

      // Exactement la sélection de FACTURE_UPDATED_SUB : ni prixM3, ni pdfPath,
      // ni abonneNom. Remplacer la ligne les perdrait.
      flux.next({
        data: {
          factureUpdated: {
            factureId: 'f1',
            numeroFacture: 'FACT-2026-08-0001',
            abonneId: 'a1',
            campagneId: 'c1',
            statut: 'PAYEE',
            consommation: 10,
            montant: 5000,
            dateReleve: '2026-08-01',
            dateLimitePaiement: '2026-09-01',
          },
        },
      });

      const [f] = component.factures();
      expect(f.statut).toBe('PAYEE');
      expect(f.abonneNom).toBe('Blandine');
      expect(f.prixM3).toBe(500);
      expect(f.pdfPath).toBe('/pdf/f1.pdf');
    });

    it('ignore une facture absente de la liste affichée', async () => {
      const { component, flux } = setup([facture()]);
      await laisserChargerPuisEcouter();

      flux.next({ data: { factureUpdated: { factureId: 'inconnue', statut: 'PAYEE' } } });

      expect(component.factures()).toHaveLength(1);
      expect(component.factures()[0].statut).toBe('IMPAYEE');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('/paiements — paiementCree', () => {
    function setup(paiements: Paiement[], factures: Facture[] = [facture()]) {
      const flux = new Subject<{ data: { paiementCree: Partial<Paiement> } }>();
      TestBed.configureTestingModule({
        imports: [PaiementsListComponent],
        providers: [
          provideRouter([]),
          ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
          { provide: Apollo, useValue: { subscribe: () => flux.asObservable() } },
          {
            provide: FacturesService,
            useValue: {
              getAllPaiements: vi.fn().mockResolvedValue(paiements),
              getFactures: vi.fn().mockResolvedValue(factures),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(PaiementsListComponent);
      fixture.detectChanges();
      return { component: fixture.componentInstance, flux };
    }

    /** Exactement la sélection de PAIEMENT_CREE_SUB — sans champs d'annulation. */
    const evenement = {
      paiementId: 'p9',
      factureId: 'f1',
      montant: 1234,
      datePaiement: '2026-08-28T09:15:00Z',
      modePaiement: 'ESPECES' as const,
      referenceTransaction: 'REF-9',
    };

    it('comble les champs d’annulation absents du flux — un paiement neuf n’est pas annulé', async () => {
      const { component, flux } = setup([]);
      await laisserChargerPuisEcouter();

      flux.next({ data: { paiementCree: evenement } });

      const [p] = component.paiements();
      expect(p.annule).toBe(false);
      expect(p.annuleLe).toBeNull();
      expect(p.motifAnnulation).toBeNull();
      // `createdAt` n'est pas transmis : la date de paiement en tient lieu.
      expect(p.createdAt).toBe(evenement.datePaiement);
    });

    it('pose l’encaissement en tête — le journal est antichronologique', async () => {
      const ancien: Paiement = {
        paiementId: 'p1',
        factureId: 'f1',
        montant: 500,
        datePaiement: '2026-07-01T00:00:00Z',
        modePaiement: 'ESPECES',
        referenceTransaction: '',
        createdAt: '2026-07-01T00:00:00Z',
        annule: false,
        annuleLe: null,
        annulePar: null,
        motifAnnulation: null,
      };
      const { component, flux } = setup([ancien]);
      await laisserChargerPuisEcouter();

      flux.next({ data: { paiementCree: evenement } });

      expect(component.paiements().map((p) => p.paiementId)).toEqual(['p9', 'p1']);
    });

    it('ne double pas la ligne pour celui qui vient d’encaisser', async () => {
      const { component, flux } = setup([]);
      await laisserChargerPuisEcouter();

      // Sa mutation a déjà inséré la ligne ; son propre événement lui revient.
      flux.next({ data: { paiementCree: evenement } });
      flux.next({ data: { paiementCree: evenement } });

      expect(component.paiements()).toHaveLength(1);
    });

    it('fait suivre le total encaissé sans rechargement', async () => {
      const { component, flux } = setup([]);
      await laisserChargerPuisEcouter();
      const avant = component.totalMontant();

      flux.next({ data: { paiementCree: evenement } });

      expect(component.totalMontant()).toBe(avant + 1234);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('/configuration — configUpdated et tarifUpdated', () => {
    const infos: InfosSociete = {
      nom: 'SGFE',
      adresse: 'Yaoundé',
      telephone: '658552294',
      logoPath: '',
      updatedAt: '2026-07-10T11:34:00Z',
    };
    const tarif: Tarif = { tarifId: 't1', prixM3: 500, dateEffet: '2026-07-01', isActive: true };
    const configs: ConfigParam[] = [
      { cle: 'impaye_delai_rappel_1', valeur: '0', description: '' },
      { cle: 'impaye_delai_rappel_2', valeur: '3', description: '' },
    ];

    function setup() {
      const fluxConfig = new Subject<{ data: { configUpdated: ConfigParam } }>();
      const fluxTarif = new Subject<{ data: { tarifUpdated: Tarif } }>();
      TestBed.configureTestingModule({
        imports: [ConfigurationComponent],
        providers: [
          provideRouter([]),
          ...provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
          {
            provide: Apollo,
            useValue: {
              // Le composant ouvre les deux flux ; on les distingue par l'ordre
              // d'appel, qui est celui de `ngOnInit` : config puis tarif.
              subscribe: (() => {
                let n = 0;
                return () => (n++ === 0 ? fluxConfig.asObservable() : fluxTarif.asObservable());
              })(),
            },
          },
          {
            provide: ConfigurationService,
            useValue: {
              getInfosSociete: vi.fn().mockResolvedValue(infos),
              getConfigs: vi.fn().mockResolvedValue(configs),
            },
          },
          {
            provide: FacturesService,
            useValue: { getTarifActuel: vi.fn().mockResolvedValue(tarif) },
          },
        ],
      });
      const fixture = TestBed.createComponent(ConfigurationComponent);
      fixture.detectChanges();
      return { component: fixture.componentInstance, fluxConfig, fluxTarif };
    }

    it('recopie un paramètre distant dans un formulaire vierge', async () => {
      const { component, fluxConfig } = setup();
      await laisserChargerPuisEcouter();
      expect(component.paramValues()['rappel1']).toBe('0');

      fluxConfig.next({
        data: { configUpdated: { cle: 'impaye_delai_rappel_1', valeur: '9', description: '' } },
      });

      expect(component.paramValues()['rappel1']).toBe('9');
    });

    it('épargne une saisie en cours — le champ modifié gagne sur l’événement', async () => {
      const { component, fluxConfig } = setup();
      await laisserChargerPuisEcouter();

      // L'admin tape 7 dans « Étape 1 ».
      component.paramValues.update((v) => ({ ...v, rappel1: '7' }));
      expect(component.configDirty()).toBe(true);

      fluxConfig.next({
        data: { configUpdated: { cle: 'impaye_delai_rappel_1', valeur: '9', description: '' } },
      });

      // Sa saisie est intacte…
      expect(component.paramValues()['rappel1']).toBe('7');
      // …et la liste de référence a tout de même suivi, en silence.
      expect(component.configs().find((c) => c.cle === 'impaye_delai_rappel_1')?.valeur).toBe('9');
    });

    it('met à jour le tarif de référence quand rien n’est en cours de saisie', async () => {
      const { component, fluxTarif } = setup();
      await laisserChargerPuisEcouter();

      fluxTarif.next({
        data: {
          tarifUpdated: { tarifId: 't2', prixM3: 600, dateEffet: '2026-09-01', isActive: true },
        },
      });

      expect(component.tarifActuel()?.prixM3).toBe(600);
      expect(component.tarifPrixM3()).toBe('600');
    });

    it('épargne une modification de tarif en cours', async () => {
      const { component, fluxTarif } = setup();
      await laisserChargerPuisEcouter();

      // L'admin saisit 777 sans encore enregistrer.
      component.tarifPrixM3.set('777');
      expect(component.tarifDirty()).toBe(true);

      fluxTarif.next({
        data: {
          tarifUpdated: { tarifId: 't2', prixM3: 600, dateEffet: '2026-09-01', isActive: true },
        },
      });

      // Le bandeau « en vigueur » suit, le champ en cours de saisie non.
      expect(component.tarifActuel()?.prixM3).toBe(600);
      expect(component.tarifPrixM3()).toBe('777');
    });
  });
});
