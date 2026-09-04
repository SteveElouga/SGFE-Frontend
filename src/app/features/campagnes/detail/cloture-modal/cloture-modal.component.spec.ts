import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService, TranslationObject } from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { ClotureModalComponent } from './cloture-modal.component';
import { CampagnesService } from '../../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { ResumeCloture } from '../../../../shared/models/campagne.model';
import type { Tarif } from '../../../../shared/models/facture.model';

/**
 * Clôturer une campagne déclenche la génération des factures et verrouille
 * définitivement ses relevés — l'écran le dit lui-même : « Cette action est
 * irréversible ». Le test qui compte le plus ici n'est pas ce que la modale
 * affiche, mais ce qu'elle refuse d'envoyer : la mutation `cloturerCampagne`
 * ne doit jamais partir sans la case de confirmation cochée, quel que soit le
 * chemin (bouton, appel direct, double clic pendant l'envoi).
 */
function resume(p: Partial<ResumeCloture> = {}): ResumeCloture {
  return {
    campagneId: 'camp-1',
    totalAbonnes: 100,
    nbReleves: 60,
    nbEstimes: 10,
    nbNonReleves: 5,
    nbRestants: 25,
    nbFacturesAGenerer: 70,
    ...p,
  };
}

function tarif(p: Partial<Tarif> = {}): Tarif {
  return { tarifId: 't-1', prixM3: 500, dateEffet: '2026-01-01', isActive: true, ...p };
}

describe('ClotureModalComponent', () => {
  function setup(over: {
    resumeCloture?: ResumeCloture | null;
    relevesByStatut?: { releve: number; estime: number; nonReleve: number; aRelever: number };
    envoyerWhatsappAuto?: boolean | null;
    tarifActuel?: Tarif | null;
    cloturerImpl?: () => Promise<void>;
  } = {}) {
    const cloturerCampagne = over.cloturerImpl
      ? vi.fn(over.cloturerImpl)
      : vi.fn().mockResolvedValue(undefined);
    const success = vi.fn();
    const error = vi.fn();

    TestBed.configureTestingModule({
      imports: [ClotureModalComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: CampagnesService, useValue: { cloturerCampagne } },
        { provide: ToastService, useValue: { success, error } },
      ],
    });

    const fixture = TestBed.createComponent(ClotureModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('campagneId', 'camp-1');
    fixture.componentRef.setInput('periode', 'Août 2026');
    fixture.componentRef.setInput('envoyerWhatsappAuto', over.envoyerWhatsappAuto ?? false);
    fixture.componentRef.setInput('tarifActuel', over.tarifActuel ?? null);
    fixture.componentRef.setInput('resumeCloture', over.resumeCloture ?? null);
    fixture.componentRef.setInput(
      'relevesByStatut',
      over.relevesByStatut ?? { releve: 0, estime: 0, nonReleve: 0, aRelever: 0 },
    );
    fixture.detectChanges();

    return { fixture, c: fixture.componentInstance, cloturerCampagne, success, error };
  }

  // ── Garde-fou n°1 : jamais sans confirmation ──────────────────────────────

  describe('la mutation ne part jamais sans confirmation', () => {
    it('cloturer() ne fait rien tant que la case n’est pas cochée', async () => {
      const { c, cloturerCampagne } = setup();
      expect(c.clotureConfirme()).toBe(false);
      await c.cloturer();
      expect(cloturerCampagne).not.toHaveBeenCalled();
    });

    it('n’émet pas non plus « saved » sans confirmation', async () => {
      const { c } = setup();
      const emissions: void[] = [];
      c.saved.subscribe(() => emissions.push(undefined));
      await c.cloturer();
      expect(emissions).toHaveLength(0);
    });

    it('part avec la confirmation cochée, et avec le bon identifiant de campagne', async () => {
      const { c, cloturerCampagne } = setup();
      c.clotureConfirme.set(true);
      await c.cloturer();
      expect(cloturerCampagne).toHaveBeenCalledTimes(1);
      expect(cloturerCampagne).toHaveBeenCalledWith('camp-1');
    });

    it('n’envoie pas une deuxième fois si une clôture est déjà en vol', async () => {
      let resolve!: () => void;
      const enVol = new Promise<void>((r) => (resolve = r));
      const { c, cloturerCampagne } = setup({ cloturerImpl: () => enVol });
      c.clotureConfirme.set(true);

      const premier = c.cloturer();
      const second = c.cloturer(); // double clic pendant l'envoi
      resolve();
      await Promise.all([premier, second]);

      expect(cloturerCampagne).toHaveBeenCalledTimes(1);
    });

    it('rouvrir la modale redemande la confirmation, même si elle avait déjà été cochée', () => {
      const { fixture, c } = setup();
      c.clotureConfirme.set(true);

      // Fermeture (le parent pilote `open` depuis l'extérieur).
      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();

      // Réouverture : l'effet de remise à zéro doit se redéclencher.
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();

      expect(c.clotureConfirme()).toBe(false);
    });

    it('rester ouverte ne réinitialise pas la case en cours de saisie', () => {
      // Contre-épreuve du test précédent : sans transition fermé→ouvert, la
      // case ne doit pas être remise à zéro toute seule pendant que
      // l'utilisateur coche.
      const { fixture, c } = setup();
      c.clotureConfirme.set(true);
      fixture.detectChanges();
      expect(c.clotureConfirme()).toBe(true);
    });

    it('checkbox et bouton de confirmation restent cohérents dans le DOM', () => {
      const { fixture, c } = setup();
      const racine = fixture.nativeElement as HTMLElement;
      const checkbox = racine.querySelector('.cloture-check input[type="checkbox"]') as HTMLInputElement;
      const bouton = racine.querySelector('.cloture-actions__confirm') as HTMLButtonElement;

      expect(bouton.disabled).toBe(true);

      checkbox.click();
      fixture.detectChanges();

      expect(c.clotureConfirme()).toBe(true);
      expect(bouton.disabled).toBe(false);
    });
  });

  // ── Garde-fou n°2 : erreur serveur → pas de faux succès ───────────────────

  describe('échec de la mutation', () => {
    it('affiche le message serveur et relève le verrou, sans émettre saved', async () => {
      const { c, success, error } = setup({
        cloturerImpl: () => Promise.reject(new Error('Des relevés sont encore en cours de saisie.')),
      });
      c.clotureConfirme.set(true);

      const emissions: void[] = [];
      c.saved.subscribe(() => emissions.push(undefined));

      await c.cloturer();

      expect(error).toHaveBeenCalledWith('Des relevés sont encore en cours de saisie.');
      expect(success).not.toHaveBeenCalled();
      expect(emissions).toHaveLength(0);
      expect(c.cloturant()).toBe(false);
    });

    it('un échec permet de réessayer (le verrou ne reste pas bloqué)', async () => {
      const { c, cloturerCampagne } = setup({
        cloturerImpl: () => Promise.reject(new Error('Erreur réseau')),
      });
      c.clotureConfirme.set(true);
      await c.cloturer();
      expect(c.cloturant()).toBe(false);

      cloturerCampagne.mockResolvedValueOnce(undefined);
      await c.cloturer();
      expect(cloturerCampagne).toHaveBeenCalledTimes(2);
    });
  });

  // ── Ventilation : autoritative si dispo, repli heuristique sinon ──────────

  describe('clotureStats', () => {
    it('utilise resumeCloture (backend) quand il est chargé', () => {
      const { c } = setup({
        resumeCloture: resume({ nbReleves: 60, nbEstimes: 10, nbNonReleves: 5, nbRestants: 25, nbFacturesAGenerer: 70 }),
        relevesByStatut: { releve: 999, estime: 999, nonReleve: 999, aRelever: 999 }, // ne doit pas servir
      });
      expect(c.clotureStats()).toEqual({
        releve: 60,
        estime: 10,
        nonReleve: 5,
        aRelever: 25,
        facturesAGenerer: 70,
      });
    });

    it('retombe sur relevesByStatut (parent) tant que resumeCloture n’a pas chargé', () => {
      const { c } = setup({
        resumeCloture: null,
        relevesByStatut: { releve: 12, estime: 3, nonReleve: 2, aRelever: 4 },
      });
      expect(c.clotureStats()).toEqual({
        releve: 12,
        estime: 3,
        nonReleve: 2,
        aRelever: 4,
        facturesAGenerer: 15, // releve + estime, repli heuristique
      });
    });

    it('facturesAGenerer et sansReleve dérivent de clotureStats, pas d’un calcul indépendant', () => {
      const { c } = setup({
        relevesByStatut: { releve: 5, estime: 2, nonReleve: 3, aRelever: 1 },
      });
      expect(c.facturesAGenerer()).toBe(7); // 5 + 2
      expect(c.sansReleve()).toBe(4); // aRelever(1) + nonReleve(3)
    });

    it('sansReleve à zéro quand tout est relevé ou estimé', () => {
      const { c } = setup({
        resumeCloture: resume({ nbRestants: 0, nbNonReleves: 0 }),
      });
      expect(c.sansReleve()).toBe(0);
    });
  });

  // ── Ce que l'écran affiche vraiment (pas seulement ce qu'il calcule) ──────

  describe('affichage', () => {
    function monterAvecTraductions(over: Parameters<typeof setup>[0] = {}) {
      const res = setup(over);
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr', fr as unknown as TranslationObject);
      translate.use('fr');
      res.fixture.detectChanges();
      return { ...res, texte: () => (res.fixture.nativeElement as HTMLElement).textContent ?? '' };
    }

    it('affiche l’avertissement seulement s’il reste des relevés non couverts', () => {
      const { fixture, texte } = monterAvecTraductions({
        relevesByStatut: { releve: 10, estime: 0, nonReleve: 0, aRelever: 0 },
      });
      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.cloture-warn')).toBeNull();
      expect(texte()).not.toMatch(/ne seront pas facturés/i);
    });

    it('affiche l’avertissement avec les bons chiffres quand il en reste', () => {
      const { fixture, texte } = monterAvecTraductions({
        relevesByStatut: { releve: 10, estime: 2, nonReleve: 3, aRelever: 4 },
      });
      const racine = fixture.nativeElement as HTMLElement;
      expect(racine.querySelector('.cloture-warn')).toBeTruthy();
      // 4 restants + 3 non relevés = 7 abonnés sans relevé.
      expect(texte()).toMatch(/7 abonnés sans relevé/);
    });

    it('le mot « irréversible » est visible à l’écran', () => {
      const { texte } = monterAvecTraductions();
      expect(texte()).toMatch(/irréversible/i);
    });

    it('annonce le tarif appliqué quand il est chargé', () => {
      const { texte } = monterAvecTraductions({ tarifActuel: tarif({ prixM3: 650 }) });
      expect(texte()).toMatch(/650/);
    });

    it('ne prétend rien sur le tarif quand il n’a pas encore chargé', () => {
      const { texte } = monterAvecTraductions({ tarifActuel: null });
      expect(texte()).not.toMatch(/FCFA\/m³/);
    });

    it('le libellé du bouton porte le nombre réel de factures à générer', () => {
      const { texte } = monterAvecTraductions({
        resumeCloture: resume({ nbFacturesAGenerer: 42 }),
      });
      expect(texte()).toMatch(/42 factures/);
    });
  });
});
