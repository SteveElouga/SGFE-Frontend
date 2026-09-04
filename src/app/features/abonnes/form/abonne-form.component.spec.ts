import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { AbonneFormComponent } from './abonne-form.component';
import { AbonnesService } from '../../../core/abonnes/abonnes.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { ToastService } from '../../../shared/services/toast.service';
import type { AbonneDetail } from '../../../graphql/vues';

/**
 * Création/édition d'un abonné. Les garde-fous testés ici : le téléphone
 * WhatsApp et le numéro de compteur sont ceux qui alimentent ensuite la
 * facturation — un format accepté à tort s'y répercute (échec d'envoi
 * WhatsApp, ou compteur introuvable). En édition, la validité globale ne
 * reprend PAS quartier/camp (voir `canSubmit`) : seul le verrou anti-double-
 * soumission est partagé entre les deux modes.
 */

function abonneFixture(p: Partial<AbonneDetail> = {}): AbonneDetail {
  return {
    id: 'ab-1',
    numeroAbonne: 'AB-0001',
    nom: 'Diallo',
    prenom: 'Amadou',
    telephoneWhatsapp: '+237612345678',
    adresse: 'Rue 12',
    statut: 'ACTIF',
    createdAt: '2025-01-15T00:00:00.000Z',
    compteur: {
      id: 'c-1',
      numeroCompteur: 42,
      quartier: 'Plateau',
      camp: 3,
      indexInitial: 100,
      datePose: '2025-01-10',
      position: '',
      statut: 'ACTIF',
    },
    ...p,
  } as AbonneDetail;
}

/** Renseigne les champs obligatoires en création avec des valeurs valides. */
function remplirFormulaireValide(c: AbonneFormComponent): void {
  c.nom.set('Diallo');
  c.prenom.set('Amadou');
  c.telephoneWhatsapp.set('612345678');
  c.quartier.set('Bastos');
  c.camp.set('3');
  c.datePose.set(new Date(2026, 0, 15));
  c.numeroCompteur.set('1042');
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('AbonneFormComponent', () => {
  function setup(
    opts: {
      mode?: 'create' | 'edit';
      id?: string | null;
      abonne?: AbonneDetail;
      getAbonneImpl?: () => Promise<AbonneDetail>;
    } = {},
  ) {
    const mode = opts.mode ?? 'create';
    const id = opts.id !== undefined ? opts.id : mode === 'edit' ? 'ab-1' : null;

    const getAbonne = opts.getAbonneImpl
      ? vi.fn(opts.getAbonneImpl)
      : vi.fn().mockResolvedValue(opts.abonne ?? abonneFixture());
    const createAbonne = vi.fn().mockResolvedValue({ id: 'new-1', numeroAbonne: 'AB-0099' });
    const updateAbonne = vi.fn().mockResolvedValue({ id, statut: 'ACTIF' });
    const suspendreAbonne = vi.fn().mockResolvedValue({ id, statut: 'SUSPENDU' });
    const reactiverAbonne = vi.fn().mockResolvedValue({ id, statut: 'ACTIF' });
    const updateCompteur = vi.fn().mockResolvedValue({});
    const toast = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AbonneFormComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { mode },
              paramMap: { get: (k: string) => (k === 'id' ? id : null) },
            },
          },
        },
        {
          provide: AbonnesService,
          useValue: { getAbonne, createAbonne, updateAbonne, suspendreAbonne, reactiverAbonne, updateCompteur },
        },
        // Injecté par `<app-page-topbar>` → `<app-notification-bell>`, toujours dans l'arbre.
        { provide: NotificationsService, useValue: { unreadCount: signal(0), notifications: signal([]) } },
        { provide: ToastService, useValue: toast },
      ],
    });

    // Routes vides : un `navigateByUrl` réel échouerait (« Cannot match any
    // routes ») dès la soumission ou l'annulation.
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(AbonneFormComponent);
    fixture.detectChanges(); // déclenche ngOnInit → loadAbonne() si mode=edit
    return {
      fixture,
      component: fixture.componentInstance,
      getAbonne,
      createAbonne,
      updateAbonne,
      suspendreAbonne,
      reactiverAbonne,
      updateCompteur,
      toast,
      router,
    };
  }

  // ── Validation champ par champ (création) ───────────────────────────────────

  describe('validation des champs — mode création', () => {
    it('nom : vide → requis, un seul caractère → trop court, valide → aucune erreur', () => {
      const { component } = setup({ mode: 'create' });
      component.nomTouched.set(true);
      expect(component.nomFieldError()).toBe('ABONNES.FORM.NOM_REQUIRED');
      component.nom.set('A');
      expect(component.nomFieldError()).toBe('COMMON.MIN_2_CHARS');
      component.nom.set('Ba');
      expect(component.nomFieldError()).toBeNull();
    });

    it('prénom : mêmes règles que le nom', () => {
      const { component } = setup({ mode: 'create' });
      component.prenomTouched.set(true);
      expect(component.prenomFieldError()).toBe('ABONNES.FORM.PRENOM_REQUIRED');
      component.prenom.set('A');
      expect(component.prenomFieldError()).toBe('COMMON.MIN_2_CHARS');
      component.prenom.set('Awa');
      expect(component.prenomFieldError()).toBeNull();
    });

    it('téléphone WhatsApp : vide, trop court, avec espaces, puis valide', () => {
      const { component } = setup({ mode: 'create' });
      component.phoneTouched.set(true);
      expect(component.phoneFieldError()).toBe('ABONNES.FORM.PHONE_REQUIRED');

      component.telephoneWhatsapp.set('123'); // 3 chiffres, sous le minimum de 8
      expect(component.phoneFieldError()).toBe('ABONNES.FORM.PHONE_INVALID');

      component.telephoneWhatsapp.set('612 345 678'); // espaces au milieu → rejeté
      expect(component.phoneFieldError()).toBe('ABONNES.FORM.PHONE_INVALID');

      component.telephoneWhatsapp.set('612345678');
      expect(component.phoneFieldError()).toBeNull();
    });

    it('téléphone WhatsApp : un préfixe +237 déjà présent est toléré (retiré avant validation)', () => {
      const { component } = setup({ mode: 'create' });
      component.telephoneWhatsapp.set('+237612345678');
      expect(component.phoneFieldError()).toBeNull();
    });

    it('quartier : vide → requis, un caractère → trop court, valide → aucune erreur', () => {
      const { component } = setup({ mode: 'create' });
      component.quartierTouched.set(true);
      expect(component.quartierFieldError()).toBe('ABONNES.FORM.QUARTIER_REQUIRED');
      component.quartier.set('B');
      expect(component.quartierFieldError()).toBe('COMMON.MIN_2_CHARS');
      component.quartier.set('Bastos');
      expect(component.quartierFieldError()).toBeNull();
    });

    it('camp : vide, zéro, non numérique, puis un entier valide', () => {
      const { component } = setup({ mode: 'create' });
      component.campTouched.set(true);
      expect(component.campFieldError()).toBe('ABONNES.FORM.CAMP_REQUIRED');
      component.camp.set('0');
      expect(component.campFieldError()).toBe('ABONNES.FORM.CAMP_INVALID');
      component.camp.set('abc');
      expect(component.campFieldError()).toBe('ABONNES.FORM.CAMP_INVALID');
      component.camp.set('3');
      expect(component.campFieldError()).toBeNull();
    });

    it('date de souscription : requise en création', () => {
      const { component } = setup({ mode: 'create' });
      component.datePoseTouched.set(true);
      component.datePose.set(null);
      expect(component.datePoseFieldError()).toBe('ABONNES.FORM.DATE_REQUIRED');
      component.datePose.set(new Date(2026, 0, 1));
      expect(component.datePoseFieldError()).toBeNull();
    });

    it('numéro de compteur : vide, zéro, puis un entier valide — requis en création', () => {
      const { component } = setup({ mode: 'create' });
      component.numeroCompteurTouched.set(true);
      expect(component.numeroCompteurFieldError()).toBe('ABONNES.FORM.NUMERO_REQUIRED');
      component.numeroCompteur.set('0');
      expect(component.numeroCompteurFieldError()).toBe('ABONNES.FORM.NUMERO_INVALID');
      component.numeroCompteur.set('1042');
      expect(component.numeroCompteurFieldError()).toBeNull();
    });

    it('une erreur ne s\'affiche qu\'après le blur (touched) — pas dès la frappe', () => {
      const { component } = setup({ mode: 'create' });
      // Champ vide mais jamais touché : pas encore d'erreur visible.
      expect(component.nomFieldError()).toBeNull();
      component.nomTouched.set(true);
      expect(component.nomFieldError()).toBe('ABONNES.FORM.NOM_REQUIRED');
    });
  });

  describe('validation des champs — mode édition', () => {
    it('date de souscription et numéro de compteur ne sont plus exigés', () => {
      const { component } = setup({ mode: 'edit' });
      component.datePoseTouched.set(true);
      component.numeroCompteurTouched.set(true);
      component.datePose.set(null);
      component.numeroCompteur.set('');
      expect(component.datePoseFieldError()).toBeNull();
      expect(component.numeroCompteurFieldError()).toBeNull();
    });
  });

  // ── Validité globale (canSubmit) ────────────────────────────────────────────

  describe('validité globale du formulaire', () => {
    it('création : faux tant qu\'un champ obligatoire manque, vrai une fois tout renseigné', () => {
      const { component } = setup({ mode: 'create' });
      expect(component.canSubmit()).toBe(false);
      remplirFormulaireValide(component);
      expect(component.canSubmit()).toBe(true);
    });

    it('création : quartier, camp, date et numéro de compteur comptent dans la validité', () => {
      const { component } = setup({ mode: 'create' });
      remplirFormulaireValide(component);
      component.quartier.set('');
      expect(component.canSubmit()).toBe(false);
    });

    it('édition : seuls nom/prénom/téléphone comptent — quartier et camp vides n\'empêchent pas la sauvegarde', () => {
      const { component } = setup({ mode: 'edit' });
      component.nom.set('Diallo');
      component.prenom.set('Amadou');
      component.telephoneWhatsapp.set('612345678');
      component.quartier.set('');
      component.camp.set('');
      expect(component.canSubmit()).toBe(true);
    });

    it('reste faux pendant l\'enregistrement, même si tout le reste est valide', () => {
      const { component } = setup({ mode: 'create' });
      remplirFormulaireValide(component);
      component.saving.set(true);
      expect(component.canSubmit()).toBe(false);
    });
  });

  // ── Soumission — création ───────────────────────────────────────────────────

  describe('soumission — création', () => {
    it('envoie un payload exact : téléphone normalisé +237, camp/numéro en nombre, position/adresse omis si vides', async () => {
      const { component, createAbonne, toast, router } = setup({ mode: 'create' });
      remplirFormulaireValide(component);

      await component.submit();

      expect(createAbonne).toHaveBeenCalledWith({
        nom: 'Diallo',
        prenom: 'Amadou',
        telephoneWhatsapp: '+237612345678',
        adresse: undefined,
        numeroCompteur: 1042,
        quartier: 'Bastos',
        camp: 3,
        indexInitial: 0,
        datePose: '2026-01-15',
        position: undefined,
      });
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
    });

    it('inclut adresse/position trimées et l\'index initial saisi quand ils sont renseignés', async () => {
      const { component, createAbonne } = setup({ mode: 'create' });
      remplirFormulaireValide(component);
      component.adresse.set('  Rue 14B  ');
      component.position.set('  parcelle 12  ');
      component.indexInitial.set('12.5');

      await component.submit();

      expect(createAbonne).toHaveBeenCalledWith(
        expect.objectContaining({ adresse: 'Rue 14B', position: 'parcelle 12', indexInitial: 12.5 }),
      );
    });

    it('un index initial non numérique retombe sur 0 plutôt que NaN', async () => {
      const { component, createAbonne } = setup({ mode: 'create' });
      remplirFormulaireValide(component);
      component.indexInitial.set('abc');

      await component.submit();

      expect(createAbonne).toHaveBeenCalledWith(expect.objectContaining({ indexInitial: 0 }));
    });

    it('formulaire invalide : n\'appelle pas le service, mais force l\'affichage des erreurs', async () => {
      const { component, createAbonne } = setup({ mode: 'create' });
      expect(component.nomFieldError()).toBeNull(); // rien de touché encore

      await component.submit();

      expect(createAbonne).not.toHaveBeenCalled();
      expect(component.nomFieldError()).toBe('ABONNES.FORM.NOM_REQUIRED'); // submitAttempted force l'affichage
    });

    it('erreur serveur : toast d\'erreur, verrou levé, aucune navigation', async () => {
      const { component, createAbonne, toast, router } = setup({ mode: 'create' });
      remplirFormulaireValide(component);
      createAbonne.mockRejectedValueOnce(new Error('Numéro de compteur déjà utilisé'));

      await component.submit();

      expect(toast.error).toHaveBeenCalledWith('Numéro de compteur déjà utilisé');
      expect(component.saving()).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('ne soumet pas deux fois si une requête est encore en vol', async () => {
      const { component, createAbonne } = setup({ mode: 'create' });
      remplirFormulaireValide(component);

      const p1 = component.submit();
      const p2 = component.submit(); // déclenché avant la résolution du premier appel
      await Promise.all([p1, p2]);

      expect(createAbonne).toHaveBeenCalledTimes(1);
    });
  });

  // ── Mode édition — chargement ────────────────────────────────────────────────

  describe('mode édition — chargement', () => {
    it('pré-remplit les champs depuis l\'abonné chargé, téléphone converti en local (sans +237)', async () => {
      const a = abonneFixture({
        nom: 'Koné',
        prenom: 'Awa',
        telephoneWhatsapp: '+237698765432',
        adresse: 'Rue X',
        statut: 'SUSPENDU',
        compteur: {
          id: 'c-9', numeroCompteur: 9, quartier: 'Almadies', camp: 5,
          indexInitial: 0, datePose: '2025-05-05', position: 'Fond de cour', statut: 'ACTIF',
        },
      });
      const { component } = setup({ mode: 'edit', abonne: a });
      await flush();

      expect(component.nom()).toBe('Koné');
      expect(component.prenom()).toBe('Awa');
      expect(component.telephoneWhatsapp()).toBe('698765432');
      expect(component.adresse()).toBe('Rue X');
      expect(component.selectedStatut()).toBe('SUSPENDU');
      expect(component.quartier()).toBe('Almadies');
      expect(component.camp()).toBe('5');
      expect(component.position()).toBe('Fond de cour');
      expect(component.pageLoading()).toBe(false);
    });

    it('un abonné RESILIE ne modifie pas le select statut (ni ACTIF ni SUSPENDU)', async () => {
      const { component } = setup({ mode: 'edit', abonne: abonneFixture({ statut: 'RESILIE' }) });
      await flush();
      expect(component.selectedStatut()).toBe('ACTIF'); // valeur initiale, jamais écrasée
      expect(component.isResilie()).toBe(true);
    });

    it('affiche l\'erreur non technique telle quelle si le chargement échoue', async () => {
      const { component, router } = setup({
        mode: 'edit',
        getAbonneImpl: () => Promise.reject(new Error('Panne réseau connue')),
      });
      await flush();

      expect(component.loadError()).toBe('Panne réseau connue');
      expect(component.pageLoading()).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalledWith('/abonnes');
    });

    it('redirige vers la liste sur un NOT_FOUND plutôt que d\'afficher une erreur', async () => {
      const notFound = new CombinedGraphQLErrors(
        { data: null },
        [{ message: 'Abonné introuvable', extensions: { code: 'NOT_FOUND' } }],
      );
      const { component, router } = setup({ mode: 'edit', getAbonneImpl: () => Promise.reject(notFound) });
      await flush();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
      expect(component.loadError()).toBeNull();
    });
  });

  // ── Mode édition — soumission ────────────────────────────────────────────────

  describe('mode édition — soumission', () => {
    it('met à jour identité/contact avec un payload exact, sans toucher au statut ni au compteur si rien n\'a changé', async () => {
      const a = abonneFixture({ statut: 'ACTIF' });
      const { component, updateAbonne, suspendreAbonne, reactiverAbonne, updateCompteur, router } = setup({
        mode: 'edit',
        abonne: a,
      });
      await flush();
      component.nom.set('  Nouveaunom  ');
      component.telephoneWhatsapp.set('600000000');

      await component.submit();

      expect(updateAbonne).toHaveBeenCalledWith('ab-1', {
        nom: 'Nouveaunom',
        prenom: a.prenom,
        telephoneWhatsapp: '+237600000000',
        adresse: a.adresse,
      });
      expect(suspendreAbonne).not.toHaveBeenCalled();
      expect(reactiverAbonne).not.toHaveBeenCalled();
      expect(updateCompteur).not.toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes/ab-1');
    });

    it('suspend l\'abonné quand le statut choisi passe de ACTIF à SUSPENDU', async () => {
      const { component, suspendreAbonne, reactiverAbonne } = setup({
        mode: 'edit',
        abonne: abonneFixture({ statut: 'ACTIF' }),
      });
      await flush();
      component.selectedStatut.set('SUSPENDU');

      await component.submit();

      expect(suspendreAbonne).toHaveBeenCalledWith('ab-1');
      expect(reactiverAbonne).not.toHaveBeenCalled();
    });

    it('réactive l\'abonné quand le statut choisi passe de SUSPENDU à ACTIF', async () => {
      const { component, suspendreAbonne, reactiverAbonne } = setup({
        mode: 'edit',
        abonne: abonneFixture({ statut: 'SUSPENDU' }),
      });
      await flush();
      component.selectedStatut.set('ACTIF');

      await component.submit();

      expect(reactiverAbonne).toHaveBeenCalledWith('ab-1');
      expect(suspendreAbonne).not.toHaveBeenCalled();
    });

    it('met à jour le compteur uniquement pour les champs qui ont changé', async () => {
      const a = abonneFixture({
        compteur: {
          id: 'c-1', numeroCompteur: 1, quartier: 'Plateau', camp: 3,
          indexInitial: 0, datePose: '2025-01-01', position: '', statut: 'ACTIF',
        },
      });
      const { component, updateCompteur } = setup({ mode: 'edit', abonne: a });
      await flush();
      component.quartier.set('Almadies'); // seul champ modifié

      await component.submit();

      expect(updateCompteur).toHaveBeenCalledWith('ab-1', { quartier: 'Almadies' });
    });

    it('n\'appelle jamais updateCompteur pour un abonné sans compteur posé', async () => {
      const { component, updateCompteur } = setup({ mode: 'edit', abonne: abonneFixture({ compteur: undefined }) });
      await flush();
      component.quartier.set('Peu importe, il n\'y a rien à mettre à jour');

      await component.submit();

      expect(updateCompteur).not.toHaveBeenCalled();
    });

    it('erreur serveur pendant la sauvegarde : toast, verrou levé, pas de navigation vers la fiche', async () => {
      const { component, updateAbonne, toast, router } = setup({ mode: 'edit' });
      await flush();
      updateAbonne.mockRejectedValueOnce(new Error('Conflit de version'));

      await component.submit();

      expect(toast.error).toHaveBeenCalledWith('Conflit de version');
      expect(component.saving()).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalledWith('/abonnes/ab-1');
    });

    it('ne soumet pas deux fois si une requête est encore en vol (édition)', async () => {
      const { component, updateAbonne } = setup({ mode: 'edit' });
      await flush();

      const p1 = component.submit();
      const p2 = component.submit();
      await Promise.all([p1, p2]);

      expect(updateAbonne).toHaveBeenCalledTimes(1);
    });
  });

  // ── Annulation ───────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('en édition, revient à la fiche de l\'abonné en cours', () => {
      const { component, router } = setup({ mode: 'edit', id: 'ab-9' });
      component.cancel();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes/ab-9');
    });

    it('en création, revient à la liste', () => {
      const { component, router } = setup({ mode: 'create' });
      component.cancel();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
    });
  });

  // ── Affichage calculé ────────────────────────────────────────────────────────

  describe('affichage calculé', () => {
    it('titre et surtitre reflètent le mode création', () => {
      const { component } = setup({ mode: 'create' });
      expect(component.topbarTitle()).toBe('ABONNES.FORM.CREATE_TITLE');
      expect(component.topbarOverline()).toBe('ABONNES.FORM.BADGE_CREATE');
    });

    it('en édition, le titre inclut le numéro d\'abonné une fois chargé', async () => {
      const { component } = setup({ mode: 'edit', abonne: abonneFixture({ numeroAbonne: 'AB-0042' }) });
      await flush();
      expect(component.topbarTitle()).toBe('ABONNES.FORM.EDIT_TITLE AB-0042');
      expect(component.topbarOverline()).toBe('ABONNES.FORM.BADGE_EDIT');
    });

    it('compteurDisplay formate le numéro de compteur avec le préfixe C-', async () => {
      const { component } = setup({
        mode: 'edit',
        abonne: abonneFixture({
          compteur: { id: 'c-7', numeroCompteur: 7, quartier: 'X', camp: 1, indexInitial: 0, datePose: '2025-01-01', position: '', statut: 'ACTIF' },
        }),
      });
      await flush();
      expect(component.compteurDisplay()).toBe('C-0007');
    });

    it('dateSouscriptionDisplay formate la date de pose du compteur', async () => {
      const { component } = setup({
        mode: 'edit',
        abonne: abonneFixture({
          compteur: { id: 'c-1', numeroCompteur: 1, quartier: 'X', camp: 1, indexInitial: 0, datePose: '2025-03-04', position: '', statut: 'ACTIF' },
        }),
      });
      await flush();
      expect(component.dateSouscriptionDisplay()).toMatch(/04\/03\/2025|03\/04\/2025/);
    });
  });
});
