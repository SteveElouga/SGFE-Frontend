import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of } from 'rxjs';
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
            params: of({ ...(id ? { id } : {}) }),
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
          latitude: null, longitude: null, dateMajPosition: null,
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
          latitude: null, longitude: null, dateMajPosition: null,
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
          compteur: { id: 'c-7', numeroCompteur: 7, quartier: 'X', camp: 1, indexInitial: 0, datePose: '2025-01-01', position: '', statut: 'ACTIF', latitude: null, longitude: null, dateMajPosition: null },
        }),
      });
      await flush();
      expect(component.compteurDisplay()).toBe('C-0007');
    });

    it('dateSouscriptionDisplay formate la date de pose du compteur', async () => {
      const { component } = setup({
        mode: 'edit',
        abonne: abonneFixture({
          compteur: { id: 'c-1', numeroCompteur: 1, quartier: 'X', camp: 1, indexInitial: 0, datePose: '2025-03-04', position: '', statut: 'ACTIF', latitude: null, longitude: null, dateMajPosition: null },
        }),
      });
      await flush();
      expect(component.dateSouscriptionDisplay()).toMatch(/04\/03\/2025|03\/04\/2025/);
    });
  });

  // ── Rendu réel du template ───────────────────────────────────────────────────
  // Les blocs ci-dessus lisent presque toujours `component.xxx()` sans jamais
  // rappeler `detectChanges()` après un changement d'état : le `@if`/`@else`
  // du gabarit (squelette, erreur, sections édition/création, messages de
  // validation) n'était donc presque jamais réellement rendu.

  /** Simule une vraie saisie utilisateur (input + blur), pas juste `signal.set`. */
  function saisir(input: HTMLInputElement, valeur: string): void {
    input.value = valeur;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  describe('rendu réel du template', () => {
    it('affiche le squelette de chargement tant que l’abonné n’a pas répondu (mode édition)', async () => {
      let resoudre!: (a: AbonneDetail) => void;
      const enAttente = new Promise<AbonneDetail>((res) => { resoudre = res; });
      const { fixture } = setup({ mode: 'edit', getAbonneImpl: () => enAttente });

      expect(fixture.nativeElement.querySelector('.af-skeleton')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.af-card')).toBeNull();

      resoudre(abonneFixture());
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.af-skeleton')).toBeNull();
      expect(fixture.nativeElement.querySelector('.af-card')).not.toBeNull();
    });

    it('affiche le message d’erreur (sans bouton réessayer) quand le chargement échoue', async () => {
      const { fixture } = setup({ mode: 'edit', getAbonneImpl: () => Promise.reject(new Error('Panne réseau connue')) });
      await flush();
      fixture.detectChanges();

      const banniere = fixture.nativeElement.querySelector('.error-banner__message');
      expect(banniere).not.toBeNull();
      expect(banniere.textContent).toContain('Panne réseau connue');
      expect(fixture.nativeElement.querySelector('.error-banner__retry')).toBeNull();
      expect(fixture.nativeElement.querySelector('.af-card')).toBeNull();
    });

    it('en création, le numéro affiche un tiret et aucun statut n’est proposé', () => {
      const { fixture } = setup({ mode: 'create' });
      const numero = fixture.nativeElement.querySelector('.af-readonly__value');
      expect(numero.textContent.trim()).toBe('—');
      expect(fixture.nativeElement.querySelector('p-select')).toBeNull();
      expect(fixture.nativeElement.querySelector('.af-status-badge')).toBeNull();
    });

    it('en édition (non résilié), le sélecteur de statut est rendu, pas le badge résilié', async () => {
      const { fixture } = setup({ mode: 'edit', abonne: abonneFixture({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('p-select')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.af-status-badge--resilie')).toBeNull();
    });

    it('un abonné résilié affiche le badge RÉSILIÉ, jamais le sélecteur de statut', async () => {
      const { fixture } = setup({ mode: 'edit', abonne: abonneFixture({ statut: 'RESILIE' }) });
      await flush();
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.af-status-badge--resilie');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toContain('RÉSILIÉ');
      expect(fixture.nativeElement.querySelector('p-select')).toBeNull();
    });

    it('un vrai blur sur le nom vide affiche l’erreur "requis", puis la fait disparaître une fois corrigé', () => {
      const { fixture } = setup({ mode: 'create' });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afNom');

      saisir(input, '');
      fixture.detectChanges();
      let erreur = fixture.nativeElement.querySelector('#afNom-err');
      expect(erreur).not.toBeNull();
      expect(erreur.textContent).toBe('ABONNES.FORM.NOM_REQUIRED');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.classList.contains('ng-invalid')).toBe(true);

      saisir(input, 'Diallo');
      fixture.detectChanges();
      erreur = fixture.nativeElement.querySelector('#afNom-err');
      expect(erreur).toBeNull();
      expect(input.getAttribute('aria-invalid')).toBeNull();
    });

    it('un vrai blur sur le prénom trop court affiche "trop court"', () => {
      const { fixture } = setup({ mode: 'create' });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afPrenom');

      saisir(input, 'A');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afPrenom-err').textContent).toBe('COMMON.MIN_2_CHARS');
    });

    it('un vrai blur sur le quartier vide affiche l’erreur "requis"', () => {
      const { fixture } = setup({ mode: 'create' });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afQuartier');

      saisir(input, '');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afQuartier-err').textContent).toBe('ABONNES.FORM.QUARTIER_REQUIRED');
    });

    it('un vrai blur sur le camp à zéro affiche l’erreur "invalide"', () => {
      const { fixture } = setup({ mode: 'create' });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afCamp');

      saisir(input, '0');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afCamp-err').textContent).toBe('ABONNES.FORM.CAMP_INVALID');
    });

    it('un vrai blur sur le numéro de compteur vide affiche une erreur de validation (création)', () => {
      const { fixture } = setup({ mode: 'create' });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afNumero');

      // `type="number"` : un champ vidé est lu `null` par le NumberValueAccessor
      // d'Angular (pas `''`) — `numeroCompteurError` rend alors NUMERO_INVALID
      // (`String(null)` est non vide), pas NUMERO_REQUIRED comme le donnerait
      // `component.numeroCompteur.set('')` en direct (voir les tests logique
      // plus haut). Comportement réel exercé ici, pas un choix arbitraire.
      saisir(input, '');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afNumero-err').textContent).toBe('ABONNES.FORM.NUMERO_INVALID');
    });

    it('le téléphone affiche l’indice de format tant qu’aucune erreur, puis l’erreur au blur', () => {
      const { fixture } = setup({ mode: 'create' });
      expect(fixture.nativeElement.querySelector('#afTel-hint')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#afTel-err')).toBeNull();

      const input: HTMLInputElement = fixture.nativeElement.querySelector('#afTel');
      saisir(input, '123');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afTel-err').textContent).toBe('ABONNES.FORM.PHONE_INVALID');
      expect(fixture.nativeElement.querySelector('#afTel-hint')).toBeNull();
    });

    it('en création, l’astérisque de date de souscription est affiché', () => {
      const { fixture } = setup({ mode: 'create' });
      expect(fixture.nativeElement.querySelector('label[for="afDate"]').textContent).toContain('*');
      expect(fixture.nativeElement.querySelector('p-datepicker')).not.toBeNull();
    });

    it('en édition, la date de souscription est en lecture seule, sans astérisque ni datepicker', async () => {
      const { fixture } = setup({ mode: 'edit' });
      await flush();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('label[for="afDate"]').textContent).not.toContain('*');
      expect(fixture.nativeElement.querySelector('p-datepicker')).toBeNull();
      expect(fixture.nativeElement.querySelector('.af-readonly__value').textContent?.trim().length).toBeGreaterThan(0);
    });

    it('l’erreur de date de souscription s’affiche réellement dans le DOM une fois touchée', () => {
      const { fixture, component } = setup({ mode: 'create' });
      component.datePoseTouched.set(true);
      component.datePose.set(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afDate-err').textContent).toBe('ABONNES.FORM.DATE_REQUIRED');
    });

    it('en édition, le numéro et l’index du compteur sont en lecture seule, formatés', async () => {
      const { fixture } = setup({
        mode: 'edit',
        abonne: abonneFixture({
          compteur: { id: 'c-7', numeroCompteur: 7, quartier: 'X', camp: 1, indexInitial: 0, datePose: '2025-01-01', position: '', statut: 'ACTIF', latitude: null, longitude: null, dateMajPosition: null },
        }),
      });
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#afNumero')).toBeNull();
      const valeurs = Array.from(fixture.nativeElement.querySelectorAll('.af-readonly__value--mono')) as HTMLElement[];
      expect(valeurs.some((v) => v.textContent?.includes('C-0007'))).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('ABONNES.FORM.INDEX_READONLY');
      expect(fixture.nativeElement.querySelector('.af-readonly__badge--disabled, .af-readonly--disabled')).not.toBeNull();
    });

    it('un clic réel sur "Enregistrer" avec un formulaire invalide affiche toutes les erreurs à la fois', () => {
      const { fixture, createAbonne } = setup({ mode: 'create' });
      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.af-btn--primary');

      bouton.click();
      fixture.detectChanges();

      expect(createAbonne).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#afNom-err')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#afPrenom-err')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#afQuartier-err')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#afCamp-err')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#afNumero-err')).not.toBeNull();
    });

    it('un clic réel sur "Enregistrer" avec un formulaire valide crée l’abonné et redirige', async () => {
      const { fixture, createAbonne, router } = setup({ mode: 'create' });
      saisir(fixture.nativeElement.querySelector('#afNom'), 'Diallo');
      saisir(fixture.nativeElement.querySelector('#afPrenom'), 'Amadou');
      saisir(fixture.nativeElement.querySelector('#afTel'), '612345678');
      saisir(fixture.nativeElement.querySelector('#afQuartier'), 'Bastos');
      saisir(fixture.nativeElement.querySelector('#afCamp'), '3');
      saisir(fixture.nativeElement.querySelector('#afNumero'), '1042');
      fixture.componentInstance.datePose.set(new Date(2026, 0, 15));
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.af-btn--primary');
      bouton.click();
      await flush();
      fixture.detectChanges();

      expect(createAbonne).toHaveBeenCalledTimes(1);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
      expect(fixture.nativeElement.querySelector('#afNom-err')).toBeNull();
    });

    it('pendant l’enregistrement, le bouton affiche "en cours" et devient inerte', async () => {
      let resoudre!: () => void;
      const enAttente = new Promise<{ id: string; numeroAbonne: string }>((res) => {
        resoudre = () => res({ id: 'new-1', numeroAbonne: 'AB-0099' });
      });
      const { fixture, component, createAbonne } = setup({ mode: 'create' });
      createAbonne.mockReturnValue(enAttente);
      remplirFormulaireValide(component);
      fixture.detectChanges();

      const promesse = component.submit();
      fixture.detectChanges();

      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.af-btn--primary');
      expect(bouton.disabled).toBe(true);
      expect(bouton.textContent).toContain('ABONNES.FORM.SAVING');

      resoudre();
      await promesse;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.af-btn--primary').disabled).toBe(false);
    });

    it('un clic réel sur "Annuler" déclenche la navigation attendue selon le mode', () => {
      const { fixture, router } = setup({ mode: 'create' });
      const bouton: HTMLButtonElement = fixture.nativeElement.querySelector('.af-btn--ghost');

      bouton.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/abonnes');
    });

    it('le titre du topbar reflète le mode création', () => {
      const { fixture } = setup({ mode: 'create' });
      expect(fixture.nativeElement.textContent).toContain('ABONNES.FORM.CREATE_TITLE');
    });

    it('le titre du topbar inclut le n° d’abonné une fois chargé, en édition', async () => {
      const { fixture } = setup({ mode: 'edit', abonne: abonneFixture({ numeroAbonne: 'AB-0042' }) });
      await flush();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('ABONNES.FORM.EDIT_TITLE AB-0042');
    });

    it('un vrai changement dans le champ position (libre, optionnel) met à jour le signal', () => {
      const { fixture, component } = setup({ mode: 'create' });
      saisir(fixture.nativeElement.querySelector('#afPosition'), 'Fond de cour');
      expect(component.position()).toBe('Fond de cour');
    });

    it('un vrai changement dans le champ adresse (libre, optionnel) met à jour le signal', () => {
      const { fixture, component } = setup({ mode: 'create' });
      saisir(fixture.nativeElement.querySelector('#afAdresse'), 'Rue 14B');
      expect(component.adresse()).toBe('Rue 14B');
    });

    it('un vrai changement dans l’index initial (création) met à jour le signal', () => {
      const { fixture, component } = setup({ mode: 'create' });
      // `type="number"` : le NumberValueAccessor d'Angular convertit la
      // saisie en nombre, pas en chaîne (contrairement à `signal.set('12.5')`
      // utilisé par les tests logique ci-dessus).
      saisir(fixture.nativeElement.querySelector('#afIndex'), '12.5');
      expect(component.indexInitial()).toBe(12.5 as unknown as string);
    });

    it('un vrai changement de statut via le sélecteur PrimeNG met à jour le signal (édition)', async () => {
      const { fixture, component } = setup({ mode: 'edit', abonne: abonneFixture({ statut: 'ACTIF' }) });
      await flush();
      fixture.detectChanges();

      const select = fixture.debugElement.query(By.css('p-select'));
      select.triggerEventHandler('ngModelChange', 'SUSPENDU');

      expect(component.selectedStatut()).toBe('SUSPENDU');
    });

    it('un vrai changement/blur sur le datepicker met à jour le signal et son état "touché" (création)', () => {
      const { fixture, component } = setup({ mode: 'create' });
      const datepicker = fixture.debugElement.query(By.css('p-datepicker'));

      const nouvelleDate = new Date(2026, 5, 1);
      datepicker.triggerEventHandler('ngModelChange', nouvelleDate);
      expect(component.datePose()).toBe(nouvelleDate);

      expect(component.datePoseTouched()).toBe(false);
      datepicker.triggerEventHandler('onBlur', undefined);
      expect(component.datePoseTouched()).toBe(true);
    });
  });
});
