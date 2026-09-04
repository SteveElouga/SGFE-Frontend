import { TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslationObject,
  provideTranslateService,
} from '@ngx-translate/core';
import fr from '../../../../../../public/i18n/fr.json';
import { RemplacerCompteurSheetComponent } from './remplacer-compteur-sheet.component';
import { AbonnesService } from '../../../../core/abonnes/abonnes.service';
import { CampagnesService } from '../../../../core/campagnes/campagnes.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { AbonneCibleCompteur } from '../../../../graphql/vues';
import type { Compteur } from '../../../../shared/models/abonne.model';

/**
 * Remplacer un compteur (écran 19) archive l'ancien avec son dernier index de
 * fermeture et pose un nouveau compteur. Le formulaire se réinitialise et
 * recharge ce dernier index à CHAQUE ouverture — un remplacement pour le
 * mauvais abonné (numéro/camp oubliés d'une session précédente) serait
 * silencieusement incorrect sinon. Le garde-fou de `save()` porte sur le
 * numéro et le camp du nouveau compteur, et sur l'attente du dernier index.
 */
function abonne(p: Partial<AbonneCibleCompteur> = {}): AbonneCibleCompteur {
  return {
    id: 'ab-1',
    nom: 'Diallo',
    prenom: 'Amadou',
    numeroAbonne: 'AB-0001',
    compteur: {
      id: 'c-1',
      numeroCompteur: 1042,
      quartier: 'Plateau',
      camp: 3,
      datePose: '2024-01-10',
      position: 'Devant portail',
    },
    ...p,
  };
}

describe('RemplacerCompteurSheetComponent', () => {
  function setup(over: Partial<{ a: AbonneCibleCompteur | null; dernierIndex: number | null }> = {}) {
    const remplacerCompteur = vi.fn().mockResolvedValue({
      id: 'c-2', numeroCompteur: 2001, quartier: 'Plateau', camp: 3, indexInitial: 0, datePose: '2026-09-04', position: '', statut: 'ACTIF',
    });
    const getDernierIndex = vi.fn().mockResolvedValue({
      abonneId: 'ab-1',
      dernierIndex: 'dernierIndex' in over ? over.dernierIndex : 458,
      estIndexInitial: false,
    });
    const toastError = vi.fn();

    TestBed.configureTestingModule({
      imports: [RemplacerCompteurSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { remplacerCompteur } },
        { provide: CampagnesService, useValue: { getDernierIndex } },
        { provide: ToastService, useValue: { error: toastError, success: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(RemplacerCompteurSheetComponent);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonne());
    fixture.componentRef.setInput('open', true); // déclenche init() + loadDernierIndex()
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, remplacerCompteur, getDernierIndex, toastError };
  }

  async function ouvrirEtAttendre(over?: Partial<{ a: AbonneCibleCompteur | null; dernierIndex: number | null }>) {
    const res = setup(over);
    await Promise.resolve();
    await Promise.resolve();
    return res;
  }

  // ── Initialisation à l'ouverture ─────────────────────────────────────────

  it('reprend le quartier, le camp et la position de l’ancien compteur à l’ouverture', () => {
    const { c } = setup();
    expect(c.newQuartier()).toBe('Plateau');
    expect(c.newCamp()).toBe('3');
    expect(c.newPosition()).toBe('Devant portail');
    expect(c.newNumeroCompteur()).toBe(''); // le nouveau numéro n'est jamais pré-rempli
  });

  it('charge le dernier index de l’ancien compteur à l’ouverture', async () => {
    const { c, getDernierIndex } = await ouvrirEtAttendre({ dernierIndex: 720 });
    expect(getDernierIndex).toHaveBeenCalledWith('ab-1');
    expect(c.dernierIndex()).toBe(720);
    expect(c.dernierIndexDisplay()).toBe('720 m³');
  });

  it('affiche un tiret tant que le dernier index n’est pas encore connu', () => {
    const { c } = setup();
    expect(c.dernierIndex()).toBeNull();
    expect(c.dernierIndexDisplay()).toBe('—');
  });

  it('réinitialise le formulaire à chaque réouverture (pas de reliquat de l’abonné précédent)', async () => {
    const { fixture, c } = await ouvrirEtAttendre();
    c.newNumeroCompteur.set('9999');
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(c.newNumeroCompteur()).toBe('');
  });

  it('n’échoue pas silencieusement si le dernier index ne peut pas être chargé', async () => {
    const getDernierIndex = vi.fn().mockRejectedValue(new Error('indisponible'));
    TestBed.configureTestingModule({
      imports: [RemplacerCompteurSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { remplacerCompteur: vi.fn() } },
        { provide: CampagnesService, useValue: { getDernierIndex } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(RemplacerCompteurSheetComponent);
    fixture.componentRef.setInput('abonne', abonne());
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.componentInstance.dernierIndex()).toBeNull();
    expect(fixture.componentInstance.dernierIndexLoading()).toBe(false);
  });

  // ── Le garde-fou de save() ──────────────────────────────────────────────

  it('refuse d’enregistrer sans numéro de nouveau compteur', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre();
    c.newCamp.set('3');
    await c.save();
    expect(remplacerCompteur).not.toHaveBeenCalled();
  });

  it('refuse d’enregistrer sans camp', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre();
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('');
    await c.save();
    expect(remplacerCompteur).not.toHaveBeenCalled();
  });

  it('refuse d’enregistrer tant que le dernier index est en cours de chargement', async () => {
    const { c, remplacerCompteur } = setup(); // pas d'attente : loadDernierIndex() encore en vol
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');
    expect(c.dernierIndexLoading()).toBe(true);
    await c.save();
    expect(remplacerCompteur).not.toHaveBeenCalled();
  });

  it('ne fait rien sans abonné ciblé', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ a: null });
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');
    await c.save();
    expect(remplacerCompteur).not.toHaveBeenCalled();
  });

  // ── Le payload exact ──────────────────────────────────────────────────────

  it('transmet le dernier index comme index de fermeture de l’ancien compteur', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ dernierIndex: 458.5 });
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');

    await c.save();

    expect(remplacerCompteur).toHaveBeenCalledWith('ab-1', expect.objectContaining({ indexFermeture: 458.5 }));
  });

  it('envoie 0 comme index de fermeture quand le serveur ne renvoie aucun dernier index', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ dernierIndex: null });
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');

    await c.save();

    expect(remplacerCompteur).toHaveBeenCalledWith('ab-1', expect.objectContaining({ indexFermeture: 0 }));
  });

  it('transmet le payload complet du nouveau compteur, position nettoyée', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ a: abonne({ id: 'ab-42' }), dernierIndex: 100 });
    c.newNumeroCompteur.set('2001');
    c.newQuartier.set('Centre');
    c.newCamp.set('5');
    c.newIndexInitial.set('0.000');
    c.newPosition.set('  Près du portail  ');
    c.newDatePose.set(new Date(2026, 8, 4)); // 4 septembre 2026 (mois 0-indexé)

    await c.save();

    expect(remplacerCompteur).toHaveBeenCalledWith('ab-42', {
      indexFermeture: 100,
      nouveauNumeroCompteur: 2001,
      nouveauQuartier: 'Centre',
      nouveauCamp: 5,
      nouvelIndexInitial: 0,
      dateRemplacement: '2026-09-04',
      nouvellePosition: 'Près du portail',
    });
  });

  it('retombe sur un index initial de 0 quand le champ n’est pas un nombre', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ dernierIndex: 100 });
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');
    c.newIndexInitial.set('abc');

    await c.save();

    expect(remplacerCompteur).toHaveBeenCalledWith('ab-1', expect.objectContaining({ nouvelIndexInitial: 0 }));
  });

  it('émet le nouveau compteur renvoyé par le serveur', async () => {
    const { c } = await ouvrirEtAttendre({ dernierIndex: 100 });
    const recu: unknown[] = [];
    c.saved.subscribe((v) => recu.push(v));
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');

    await c.save();

    expect(recu).toHaveLength(1);
    expect((recu[0] as { numeroCompteur: number }).numeroCompteur).toBe(2001);
  });

  it('affiche l’erreur du serveur plutôt qu’un faux succès, et lève le verrou', async () => {
    const { c, remplacerCompteur, toastError } = await ouvrirEtAttendre({ dernierIndex: 100 });
    remplacerCompteur.mockRejectedValueOnce(new Error('Numéro de compteur déjà utilisé'));
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');

    await c.save();

    expect(toastError).toHaveBeenCalledWith('Numéro de compteur déjà utilisé');
    expect(c.loading()).toBe(false);
  });

  // ── Constat : `save()` n'a pas de garde-fou anti double-appel ─────────────
  //
  // BUG DE PRODUCTION CONSTATÉ (non corrigé, cf. consignes) : contrairement à
  // `reactiver-sheet`/`suspendre-sheet`/`resilier-sheet`/`arriere-sheet`, la
  // méthode `save()` de `remplacer-compteur-sheet.component.ts` (ligne 103-132)
  // ne vérifie jamais `this.loading()` avant de lancer un nouvel appel — seul
  // le bouton (`[disabled]="loading()"`) protège l'écran d'un double envoi. Un
  // second appel programmatique à `save()` pendant qu'un premier est en vol
  // (ex. un futur raccourci clavier, ou un test qui appelle la méthode
  // directement comme ci-dessous) déclenche donc bel et bien une deuxième
  // mutation. Ce test documente ce comportement réel, il ne le cautionne pas.
  it('BUG constaté : rien ne bloque un second appel programmatique à save() pendant que le premier est en vol', async () => {
    const { c, remplacerCompteur } = await ouvrirEtAttendre({ dernierIndex: 100 });
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');

    const premier = c.save();
    expect(c.loading()).toBe(true);
    const second = c.save(); // aucun garde-fou sur `loading()` ici, contrairement aux sheets sœurs
    await Promise.all([premier, second]);

    expect(remplacerCompteur).toHaveBeenCalledTimes(2);
  });
});

/**
 * Ce que la feuille montre : la carte de l'ancien compteur (conditionnelle),
 * le dernier index affiché pendant et après son chargement, la ligne de
 * localisation reprise, et l'état loading des deux boutons pendant l'envoi.
 */
describe('RemplacerCompteurSheetComponent · ce qui s’affiche', () => {
  function monter(over: Partial<{
    a: AbonneCibleCompteur | null;
    dernierIndex: number | null;
    remplacerCompteur: ReturnType<typeof vi.fn>;
    getDernierIndex: ReturnType<typeof vi.fn>;
  }> = {}) {
    const remplacerCompteur = over.remplacerCompteur ?? vi.fn().mockResolvedValue({
      id: 'c-2', numeroCompteur: 2001, quartier: 'Plateau', camp: 3, indexInitial: 0, datePose: '2026-09-04', position: '', statut: 'ACTIF',
    } as Compteur);
    const getDernierIndex = over.getDernierIndex ?? vi.fn().mockResolvedValue({
      abonneId: 'ab-1',
      dernierIndex: 'dernierIndex' in over ? over.dernierIndex : 458,
      estIndexInitial: false,
    });

    TestBed.configureTestingModule({
      imports: [RemplacerCompteurSheetComponent],
      providers: [
        provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
        { provide: AbonnesService, useValue: { remplacerCompteur } },
        { provide: CampagnesService, useValue: { getDernierIndex } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr as unknown as TranslationObject);
    translate.use('fr');

    const fixture = TestBed.createComponent(RemplacerCompteurSheetComponent);
    fixture.componentRef.setInput('abonne', 'a' in over ? over.a : abonne());
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const racine = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      c: fixture.componentInstance,
      racine,
      texte: () => racine.textContent ?? '',
      ancienneCarte: () => racine.querySelector('.meter-old-card'),
      confirmer: () => racine.querySelector('.dialog-btn--primary') as HTMLButtonElement,
      annuler: () => racine.querySelector('.dialog-btn--ghost') as HTMLButtonElement,
    };
  }

  it('affiche la carte de l’ancien compteur quand l’abonné en a un', () => {
    const { ancienneCarte, texte } = monter();
    expect(ancienneCarte()).toBeTruthy();
    expect(texte()).toContain('C-1042');
  });

  it('n’affiche pas de carte d’ancien compteur quand l’abonné n’en a pas', () => {
    const { ancienneCarte } = monter({ a: abonne({ compteur: null }) });
    expect(ancienneCarte()).toBeNull();
  });

  it('affiche des points de suspension pendant le chargement du dernier index', () => {
    const { racine } = monter();
    expect(racine.querySelector('.meter-old-card__loading')?.textContent?.trim()).toBe('…');
  });

  it('affiche le dernier index une fois chargé, formaté avec séparateur de milliers', async () => {
    const { fixture, racine, texte } = monter({ dernierIndex: 12_000 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texte()).toMatch(/12[\s ]?000 m³/);
    expect(racine.querySelector('.meter-old-card__loading')).toBeNull();
  });

  it('affiche un tiret quand le dernier index reste introuvable', async () => {
    const { fixture, texte } = monter({ dernierIndex: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texte()).toContain('—');
  });

  it('affiche la localisation reprise de l’ancien compteur', () => {
    const { texte } = monter({ a: abonne({ compteur: { ...abonne().compteur!, quartier: 'Bastos', camp: 7 } }) });
    expect(texte()).toContain('Bastos');
    expect(texte()).toContain('Camp 7');
  });

  it('n’affiche pas de ligne de localisation reprise sans ancien compteur', () => {
    const { texte } = monter({ a: abonne({ compteur: null }) });
    expect(texte()).not.toMatch(/Localisation reprise/);
  });

  it('un clic sur "confirmer" avec des champs vides ne déclenche pas la mutation (silencieux, pas d’erreur affichée)', async () => {
    const remplacerCompteur = vi.fn();
    const { fixture, confirmer } = monter({ remplacerCompteur });
    confirmer().click();
    await fixture.whenStable();
    expect(remplacerCompteur).not.toHaveBeenCalled();
  });

  it('le bouton "annuler" émet close sans appeler le service', () => {
    const { c, annuler } = monter();
    const fermetures: void[] = [];
    c.close.subscribe(() => fermetures.push(undefined));
    annuler().click();
    expect(fermetures).toHaveLength(1);
  });

  it('désactive les deux boutons et change le libellé pendant l’enregistrement', async () => {
    let resoudre!: (v: Compteur) => void;
    const remplacerCompteur = vi.fn(() => new Promise<Compteur>((r) => { resoudre = r; }));
    const { fixture, c, confirmer, annuler, texte } = monter({ remplacerCompteur });
    await fixture.whenStable();
    c.newNumeroCompteur.set('2001');
    c.newCamp.set('3');
    fixture.detectChanges();

    confirmer().click();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(true);
    expect(annuler().disabled).toBe(true);
    expect(texte()).toContain('Remplacement…');

    resoudre({ id: 'c-2', numeroCompteur: 2001, quartier: 'Plateau', camp: 3, indexInitial: 0, datePose: '2026-09-04', position: '', statut: 'ACTIF' } as Compteur);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmer().disabled).toBe(false);
    expect(texte()).toContain('Confirmer le remplacement');
  });
});
