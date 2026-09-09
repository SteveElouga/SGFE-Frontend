import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { ConfirmationService } from 'primeng/api';
import { Subject, of } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfigurationComponent } from './configuration.component';
import { ConfigurationService } from '../../core/configuration/configuration.service';
import { FacturesService } from '../../core/factures/factures.service';
import { ToastService } from '../../shared/services/toast.service';
import type { ConfigParam, InfosSociete } from '../../shared/models/configuration.model';
import type { Tarif } from '../../shared/models/facture.model';

/**
 * Écran Configuration (réglages système, ADMIN). Ces tests portent sur ce qui
 * distingue vraiment ce formulaire : la résolution des clés backend
 * (insensible casse/séparateurs), le calcul de « ce qui a changé » avant tout
 * enregistrement, le tarif comme action séparée non rétroactive, et la règle
 * commune aux deux flux temps réel — une saisie en cours gagne toujours sur un
 * événement distant.
 */
function infos(p: Partial<InfosSociete> = {}): InfosSociete {
  return { nom: 'Régie des Eaux', adresse: 'Douala', telephone: '+237600000000', logoPath: '', updatedAt: '', ...p };
}

function config(cle: string, valeur: string): ConfigParam {
  return { cle, valeur, description: '' };
}

function tarif(p: Partial<Tarif> = {}): Tarif {
  return { tarifId: 't-1', prixM3: 500, dateEffet: '2026-01-01', isActive: true, ...p };
}

const defaultConfigs = () => [
  config('impaye_delai_rappel_1', '3'),
  config('impaye_delai_rappel_2', '7'),
  config('impaye_delai_avertissement', '10'),
  config('impaye_delai_suspension', '15'),
  config('impaye_suspension_auto', 'true'),
  config('impaye_suspension_relances', 'false'),
  config('delai_paiement_jours', '15'),
  config('token_validite_jours', '30'),
  config('notifications_admin_activees', 'false'),
  config('email_admin_notifications', 'admin@x.com'),
];

function monter(over: {
  getInfosSociete?: ReturnType<typeof vi.fn>;
  getConfigs?: ReturnType<typeof vi.fn>;
  getTarifActuel?: ReturnType<typeof vi.fn>;
  updateInfosSociete?: ReturnType<typeof vi.fn>;
  updateConfig?: ReturnType<typeof vi.fn>;
  updateTarif?: ReturnType<typeof vi.fn>;
  testerEnvoiWhatsapp?: ReturnType<typeof vi.fn>;
  revoquerTousTokensAbonnes?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
  const getInfosSociete = over.getInfosSociete ?? vi.fn().mockResolvedValue(infos());
  const getConfigs = over.getConfigs ?? vi.fn().mockResolvedValue(defaultConfigs());
  const getTarifActuel = over.getTarifActuel ?? vi.fn().mockResolvedValue(tarif());
  const updateInfosSociete = over.updateInfosSociete ?? vi.fn().mockImplementation((i) => Promise.resolve(infos(i)));
  const updateConfig = over.updateConfig ?? vi.fn().mockImplementation((cle: string, valeur: string) => Promise.resolve(config(cle, valeur)));
  const updateTarif = over.updateTarif ?? vi.fn().mockImplementation((prixM3: number, dateEffet: string) => Promise.resolve(tarif({ prixM3, dateEffet })));
  const testerEnvoiWhatsapp = over.testerEnvoiWhatsapp ?? vi.fn().mockResolvedValue({ success: true, message: 'OK' });
  const revoquerTousTokensAbonnes = over.revoquerTousTokensAbonnes ?? vi.fn().mockResolvedValue(3);

  TestBed.configureTestingModule({
    imports: [ConfigurationComponent],
    providers: [
      provideTranslateService({}),
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: vi.fn(), serializeUrl: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() }, queryParamMap: of(new Map()) } },
      {
        provide: ConfigurationService,
        useValue: { getInfosSociete, getConfigs, updateInfosSociete, updateConfig, testerEnvoiWhatsapp, revoquerTousTokensAbonnes },
      },
      { provide: FacturesService, useValue: { getTarifActuel, updateTarif } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), show: vi.fn() } },
      {
        // `query` doit renvoyer un Observable exploitable : l'onglet WhatsApp
        // rend `<app-whatsapp-link>`, qui appelle lui aussi `apollo.query(...)`
        // (même injecteur) dès son `ngOnInit`.
        provide: Apollo,
        useValue: {
          subscribe: over.subscribe ?? vi.fn().mockReturnValue(of({ data: {} })),
          query: vi.fn().mockReturnValue(of({ data: {} })),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConfigurationComponent);
  const confirmationService = fixture.debugElement.injector.get(ConfirmationService);
  return {
    fixture,
    c: fixture.componentInstance,
    getInfosSociete,
    getConfigs,
    getTarifActuel,
    updateInfosSociete,
    updateConfig,
    updateTarif,
    testerEnvoiWhatsapp,
    revoquerTousTokensAbonnes,
    confirmationService,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/**
 * Les tests ci-dessus n'appellent `detectChanges()` qu'une fois, avant la
 * résolution des données async : le template reste donc figé sur le
 * squelette de chargement et son contenu réel (onglets, formulaires) n'est
 * jamais rendu. Ce helper referme la boucle : rendu initial → attente des
 * promesses → second rendu, pour obtenir le DOM une fois les données là.
 */
async function monterEtCharger(over: Parameters<typeof monter>[0] = {}) {
  const m = monter(over);
  m.fixture.detectChanges();
  await flush();
  m.fixture.detectChanges();
  return m;
}

function tabButtons(fixture: ReturnType<typeof monter>['fixture']): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.config-tabs__tab'));
}

/**
 * Clique sur l'onglet `index` puis laisse le temps aux directives `ngModel`
 * des nouveaux champs de réécrire leur valeur dans le DOM : ce
 * modèle→vue passe par un micro-tick interne à `@angular/forms`
 * (`Promise.resolve().then(...)`), pas seulement par `detectChanges()`. Sans
 * ce `flush()`, `.value`/`.disabled` lus juste après le clic sur un champ
 * `ngModel` restent à leur valeur par défaut alors que le signal est déjà à jour.
 */
async function cliquerOnglet(fixture: ReturnType<typeof monter>['fixture'], index: number): Promise<void> {
  tabButtons(fixture)[index].click();
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
}

describe('ConfigurationComponent — chargement et résolution des clés', () => {
  it('précharge les champs société', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.societeNom()).toBe('Régie des Eaux');
    expect(c.loading()).toBe(false);
  });

  it('résout chaque paramètre logique vers sa clé backend réelle', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.hasParam('rappel1')).toBe(true);
    expect(c.getParam('rappel1')).toBe('3');
    expect(c.hasParam('avertissement')).toBe(true);
    expect(c.getParam('avertissement')).toBe('10');
  });

  it('un paramètre absent du backend est signalé introuvable', async () => {
    const { fixture, c } = monter({ getConfigs: vi.fn().mockResolvedValue([]) });
    fixture.detectChanges();
    await flush();
    expect(c.hasParam('rappel1')).toBe(false);
    expect(c.getParam('rappel1')).toBe('');
  });

  it('préremplit le numéro de test WhatsApp au format local', async () => {
    const { fixture, c } = monter({ getInfosSociete: vi.fn().mockResolvedValue(infos({ telephone: '+237655554444' })) });
    fixture.detectChanges();
    await flush();
    expect(c.waTestPhone()).toBe('655554444');
  });

  it('affiche une erreur si le chargement échoue', async () => {
    const { fixture, c } = monter({
      getInfosSociete: vi.fn().mockRejectedValue(new CombinedGraphQLErrors({ data: null }, [{ message: 'Panne' }])),
    });
    fixture.detectChanges();
    await flush();
    expect(c.error()).toBe('Panne');
  });
});

describe('ConfigurationComponent — suivi des modifications', () => {
  it('societeDirty détecte un champ modifié', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.societeDirty()).toBe(false);
    c.societeNom.set('Nouveau nom');
    expect(c.societeDirty()).toBe(true);
    expect(c.dirty()).toBe(true);
  });

  it('configDirty détecte un paramètre modifié', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.setParam('rappel1', '5');
    expect(c.configDirty()).toBe(true);
  });

  it('toggleBool inverse une valeur booléenne existante', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    expect(c.isBoolOn('suspensionAuto')).toBe(true);
    c.toggleBool('suspensionAuto');
    expect(c.isBoolOn('suspensionAuto')).toBe(false);
  });

  it('toggleBool ne fait rien sur un paramètre absent', async () => {
    const { fixture, c } = monter({ getConfigs: vi.fn().mockResolvedValue([]) });
    fixture.detectChanges();
    await flush();
    c.toggleBool('suspensionAuto');
    expect(c.getParam('suspensionAuto')).toBe('');
  });
});

describe('ConfigurationComponent — sauvegarde globale', () => {
  it('n’enregistre que les paramètres réellement changés', async () => {
    const { fixture, c, updateConfig } = monter();
    fixture.detectChanges();
    await flush();
    c.setParam('rappel1', '5');
    await c.saveAll();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith('impaye_delai_rappel_1', '5');
  });

  it('enregistre aussi les infos société si modifiées', async () => {
    const { fixture, c, updateInfosSociete } = monter();
    fixture.detectChanges();
    await flush();
    c.societeAdresse.set('Yaoundé');
    await c.saveAll();
    expect(updateInfosSociete).toHaveBeenCalledWith({
      nom: 'Régie des Eaux',
      adresse: 'Yaoundé',
      telephone: '+237600000000',
      logoPath: '',
    });
  });

  it('ne fait rien si rien n’a changé', async () => {
    const { fixture, c, updateConfig, updateInfosSociete } = monter();
    fixture.detectChanges();
    await flush();
    await c.saveAll();
    expect(updateConfig).not.toHaveBeenCalled();
    expect(updateInfosSociete).not.toHaveBeenCalled();
  });

  it('affiche l’erreur serveur sur échec', async () => {
    const { fixture, c } = monter({ updateInfosSociete: vi.fn().mockRejectedValue(new Error('boom')) });
    fixture.detectChanges();
    await flush();
    c.societeAdresse.set('Yaoundé');
    await c.saveAll();
    expect(c.saving()).toBe(false);
    const toast = TestBed.inject(ToastService) as unknown as { error: ReturnType<typeof vi.fn> };
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('ConfigurationComponent — tarif (action dédiée, non rétroactive)', () => {
  it('tarifDirty exige un prix positif et une date d’effet', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.editTarif();
    c.tarifPrixM3.set('0');
    expect(c.tarifDirty()).toBe(false);
    c.tarifPrixM3.set('600');
    expect(c.tarifDirty()).toBe(true);
  });

  it('saveTarif transmet le prix et la date au format ISO exacts', async () => {
    const { fixture, c, updateTarif } = monter();
    fixture.detectChanges();
    await flush();
    c.editTarif();
    c.tarifPrixM3.set('650');
    c.tarifDateEffet.set(new Date(2026, 8, 1));
    await c.saveTarif();
    expect(updateTarif).toHaveBeenCalledWith(650, '2026-09-01');
    expect(c.editingTarif()).toBe(false);
  });

  it('resetTarif revient au tarif de référence et ferme l’édition', async () => {
    const { fixture, c } = monter();
    fixture.detectChanges();
    await flush();
    c.editTarif();
    c.tarifPrixM3.set('999');
    c.resetTarif();
    expect(c.tarifPrixM3()).toBe('500');
    expect(c.editingTarif()).toBe(false);
  });
});

describe('ConfigurationComponent — test d’envoi WhatsApp', () => {
  it('refuse un numéro invalide sans appeler le service', async () => {
    const { fixture, c, testerEnvoiWhatsapp } = monter();
    fixture.detectChanges();
    await flush();
    c.waTestPhone.set('123');
    await c.testWhatsapp();
    expect(testerEnvoiWhatsapp).not.toHaveBeenCalled();
    expect(c.waTestResult()?.success).toBe(false);
  });

  it('normalise le numéro avant l’envoi', async () => {
    const { fixture, c, testerEnvoiWhatsapp } = monter();
    fixture.detectChanges();
    await flush();
    c.waTestPhone.set('612345678');
    await c.testWhatsapp();
    expect(testerEnvoiWhatsapp).toHaveBeenCalledWith('+237612345678');
  });

  it('affiche le motif exact d’échec renvoyé par le serveur', async () => {
    const { fixture, c } = monter({
      testerEnvoiWhatsapp: vi.fn().mockResolvedValue({ success: false, message: 'WhatsApp non connecté' }),
    });
    fixture.detectChanges();
    await flush();
    c.waTestPhone.set('612345678');
    await c.testWhatsapp();
    expect(c.waTestResult()).toEqual({ success: false, message: 'WhatsApp non connecté' });
  });
});

describe('ConfigurationComponent — révocation des tokens', () => {
  it('révoque seulement après confirmation', async () => {
    const { fixture, c, revoquerTousTokensAbonnes, confirmationService } = monter();
    fixture.detectChanges();
    await flush();
    vi.spyOn(confirmationService, 'confirm');
    c.confirmRevokeTokens();
    expect(revoquerTousTokensAbonnes).not.toHaveBeenCalled();

    const options = (confirmationService.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await options.accept();
    expect(revoquerTousTokensAbonnes).toHaveBeenCalledTimes(1);
  });
});

describe('ConfigurationComponent — temps réel : la saisie en cours gagne', () => {
  it('ecouterParametres réaligne le formulaire vierge sur l’événement distant', async () => {
    const evenements = new Subject<{ data: { configUpdated: ConfigParam | null } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    evenements.next({ data: { configUpdated: config('impaye_delai_rappel_1', '9') } });
    expect(c.getParam('rappel1')).toBe('9');
  });

  it('ecouterParametres épargne une saisie en cours', async () => {
    const evenements = new Subject<{ data: { configUpdated: ConfigParam | null } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    c.setParam('rappel1', '20'); // saisie en cours
    evenements.next({ data: { configUpdated: config('impaye_delai_rappel_1', '9') } });

    expect(c.getParam('rappel1')).toBe('20'); // pas écrasée
  });

  it('ecouterTarif met à jour la référence mais épargne une saisie de tarif en cours', async () => {
    const evenements = new Subject<{ data: { tarifUpdated: Tarif | null } }>();
    const { fixture, c } = monter({ subscribe: vi.fn().mockReturnValue(evenements) });
    fixture.detectChanges();
    await flush();

    c.editTarif();
    c.tarifPrixM3.set('777'); // saisie en cours

    evenements.next({ data: { tarifUpdated: tarif({ prixM3: 550 }) } });

    expect(c.tarifActuel()?.prixM3).toBe(550); // référence mise à jour
    expect(c.tarifPrixM3()).toBe('777'); // saisie épargnée
  });
});

/**
 * Le template a 4 onglets (`@switch (activeTab())`) mais les tests ci-dessus
 * ne rendent jamais que le squelette de chargement (voir `monterEtCharger`).
 * Les blocs suivants cliquent réellement sur les onglets et les contrôles,
 * pour que `@if`/`@for`/`@switch` s'exécutent vraiment.
 */
describe('ConfigurationComponent — rendu DOM des onglets', () => {
  it('affiche par défaut l’onglet Société avec les infos et le tarif chargés', async () => {
    const { fixture } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;
    const tabs = tabButtons(fixture);

    expect(tabs[0].classList).toContain('config-tabs__tab--active');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].classList).not.toContain('config-tabs__tab--active');
    expect((racine.querySelector('#societe-nom') as HTMLInputElement).value).toBe('Régie des Eaux');
    expect(racine.querySelector('.tarif-current__value')?.textContent).toContain('500');
    expect(racine.querySelector('.hist-row--active')?.textContent).toContain('500');
  });

  it('affiche la date de dernière modification de la société quand elle est connue', async () => {
    const { fixture } = await monterEtCharger({
      getInfosSociete: vi.fn().mockResolvedValue(infos({ updatedAt: '2026-05-01T10:00:00.000Z' })),
    });
    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('.config-card__updated')).toBeTruthy();
  });

  it('bascule sur l’onglet Relances au clic et affiche les 4 étapes + la notif admin', async () => {
    const { fixture } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);

    expect(tabButtons(fixture)[1].classList).toContain('config-tabs__tab--active');
    expect(racine.querySelectorAll('.step-row')).toHaveLength(4);
    expect((racine.querySelector('#notif-email') as HTMLInputElement).value).toBe('admin@x.com');
  });

  it('désactive un champ de relance et le switch dont la clé backend est absente', async () => {
    const { fixture } = await monterEtCharger({ getConfigs: vi.fn().mockResolvedValue([]) });
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);

    const premiereEtape = racine.querySelector('.step-row .step-delay') as HTMLElement;
    expect(premiereEtape.classList).toContain('step-delay--disabled');
    expect((premiereEtape.querySelector('input') as HTMLInputElement).disabled).toBe(true);

    const toggle = racine.querySelector('.toggle-switch') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });

  it('inverse un interrupteur booléen au clic et reflète l’état dans la classe CSS', async () => {
    const { fixture, c } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);

    const toggle = racine.querySelector('.toggle-switch') as HTMLButtonElement;
    expect(toggle.classList).toContain('toggle-switch--on');
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.classList).not.toContain('toggle-switch--on');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(c.isBoolOn('suspensionAuto')).toBe(false);
  });

  it('modifie la pause des relances, le switch « notifications admin » et l’e-mail via de vrais champs', async () => {
    const { fixture, c } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);

    const champPause = racine.querySelector('.days-box__input') as HTMLInputElement;
    champPause.value = '10';
    champPause.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.getParam('pauseVersement')).toBe('10');

    // Second interrupteur de l'onglet : « notifications admin actives ».
    const toggles = racine.querySelectorAll('.toggle-switch');
    (toggles[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(c.isBoolOn('notifAdminActives')).toBe(true);
    expect((toggles[1] as HTMLButtonElement).classList).toContain('toggle-switch--on');

    const champEmail = racine.querySelector('#notif-email') as HTMLInputElement;
    champEmail.value = 'nouvel-admin@x.com';
    champEmail.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(c.getParam('emailAdmin')).toBe('nouvel-admin@x.com');
  });

  it('modifie un délai de relance via un vrai input puis enregistre : la clé backend correcte est appelée', async () => {
    const { fixture, updateConfig } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);

    const champRappel1 = racine.querySelectorAll('.step-delay__input')[0] as HTMLInputElement;
    champRappel1.value = '5';
    champRappel1.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (racine.querySelector('.config-save') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    expect(updateConfig).toHaveBeenCalledWith('impaye_delai_rappel_1', '5');
  });

  it('onglet Utilisateurs masque le bouton d’enregistrement global et propose le lien de gestion', async () => {
    const { fixture } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 2);

    expect(tabButtons(fixture)[2].classList).toContain('config-tabs__tab--active');
    expect(racine.querySelector('.config-actions')).toBeNull();
    const lien = racine.querySelector('.users-link') as HTMLAnchorElement;
    expect(lien).toBeTruthy();
    expect(lien.textContent).toContain('CONFIGURATION.UTILISATEURS_MANAGE');
  });

  it('onglet WhatsApp affiche le lien QR, les KPI de validité et la révocation', async () => {
    const { fixture, c } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 3);

    expect(racine.querySelector('app-whatsapp-link')).toBeTruthy();
    const kpis = racine.querySelectorAll('.kpi-box__input') as NodeListOf<HTMLInputElement>;
    expect(kpis[0].value).toBe('30');
    expect(kpis[1].value).toBe('15');
    expect(racine.querySelector('.revoke-row')).toBeTruthy();

    kpis[0].value = '45';
    kpis[0].dispatchEvent(new Event('input'));
    kpis[1].value = '20';
    kpis[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(c.getParam('tokenValidite')).toBe('45');
    expect(c.getParam('delaiPaiement')).toBe('20');
  });

  it('désactive les KPI de validité WhatsApp quand leurs clés backend sont absentes', async () => {
    const { fixture } = await monterEtCharger({ getConfigs: vi.fn().mockResolvedValue([]) });
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 3);

    const kpiBoxes = racine.querySelectorAll('.kpi-box');
    expect(kpiBoxes[0].classList).toContain('kpi-box--disabled');
    expect((kpiBoxes[0].querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(kpiBoxes[1].classList).toContain('kpi-box--disabled');
  });

  it('affiche la bannière d’erreur et relance le chargement au clic sur Réessayer', async () => {
    const getInfosSociete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Panne réseau'))
      .mockResolvedValueOnce(infos());
    const { fixture } = await monterEtCharger({ getInfosSociete });
    const racine = fixture.nativeElement as HTMLElement;

    expect(racine.querySelector('.error-banner__message')?.textContent).toContain('Panne réseau');

    (racine.querySelector('.error-banner__retry') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    expect(getInfosSociete).toHaveBeenCalledTimes(2);
    expect(racine.querySelector('.error-banner')).toBeNull();
  });
});

describe('ConfigurationComponent — actions DOM (société, tarif)', () => {
  it('modifie le téléphone, l’adresse et le logo de la société via de vrais inputs', async () => {
    const { fixture, c } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    const champTel = racine.querySelector('#societe-tel') as HTMLInputElement;
    champTel.value = '+237699999999';
    champTel.dispatchEvent(new Event('input'));

    const champAdresse = racine.querySelector('#societe-adresse') as HTMLInputElement;
    champAdresse.value = 'Bonanjo';
    champAdresse.dispatchEvent(new Event('input'));

    const champLogo = racine.querySelector('#societe-logo') as HTMLInputElement;
    champLogo.value = '/assets/logo.png';
    champLogo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(c.societeTelephone()).toBe('+237699999999');
    expect(c.societeAdresse()).toBe('Bonanjo');
    expect(c.societeLogoPath()).toBe('/assets/logo.png');
  });

  it('reste sur l’onglet Société en cliquant explicitement dessus (déjà actif)', async () => {
    const { fixture } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 1);
    await cliquerOnglet(fixture, 0);

    expect(tabButtons(fixture)[0].classList).toContain('config-tabs__tab--active');
    expect(racine.querySelector('.tarif-current__value')).toBeTruthy();
  });

  it('un clic sur le fond de la modale tarif (bs-overlay) la referme comme le bouton Annuler', async () => {
    const { fixture, updateTarif } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    (racine.querySelector('.tarif-row .btn--dark-outline') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((racine.querySelector('.bs-sheet') as HTMLElement).classList).toContain('bs-sheet--open');

    (racine.querySelector('.bs-overlay') as HTMLElement).click();
    fixture.detectChanges();

    expect(updateTarif).not.toHaveBeenCalled();
    expect((racine.querySelector('.bs-sheet') as HTMLElement).classList).not.toContain('bs-sheet--open');
  });

  it('modifie le nom de la société via un vrai input, enregistre, et affiche le bouton en cours de sauvegarde', async () => {
    let resolverSauvegarde!: (v: InfosSociete) => void;
    const attente = new Promise<InfosSociete>((resolve) => {
      resolverSauvegarde = resolve;
    });
    const updateInfosSociete = vi.fn().mockReturnValue(attente);
    const { fixture } = await monterEtCharger({ updateInfosSociete });
    const racine = fixture.nativeElement as HTMLElement;

    const champNom = racine.querySelector('#societe-nom') as HTMLInputElement;
    champNom.value = 'Régie Nouvelle';
    champNom.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonSave = racine.querySelector('.config-save') as HTMLButtonElement;
    expect(boutonSave.disabled).toBe(false);

    boutonSave.click();
    fixture.detectChanges();

    // Pendant l'attente réseau : bouton désactivé + spinner (pas un mensonge de double-clic possible).
    expect(boutonSave.disabled).toBe(true);
    expect(boutonSave.querySelector('.pi-spin')).toBeTruthy();

    resolverSauvegarde(infos({ nom: 'Régie Nouvelle' }));
    await flush();
    fixture.detectChanges();

    expect(updateInfosSociete).toHaveBeenCalledWith(
      expect.objectContaining({ nom: 'Régie Nouvelle' }),
    );
    expect(boutonSave.disabled).toBe(true); // plus rien à sauvegarder : redevient inerte
    const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
    expect(toast.success).toHaveBeenCalled();
  });

  it('ouvre la modale tarif, affiche le spinner pendant l’enregistrement, puis la referme après succès', async () => {
    let resolverTarif!: (v: Tarif) => void;
    const attente = new Promise<Tarif>((resolve) => {
      resolverTarif = resolve;
    });
    const updateTarif = vi.fn().mockReturnValue(attente);
    const { fixture } = await monterEtCharger({ updateTarif });
    const racine = fixture.nativeElement as HTMLElement;

    (racine.querySelector('.tarif-row .btn--dark-outline') as HTMLButtonElement).click();
    fixture.detectChanges();

    const sheet = racine.querySelector('.bs-sheet') as HTMLElement;
    expect(sheet.classList).toContain('bs-sheet--open');

    const champPrix = racine.querySelector('#tarif-prix') as HTMLInputElement;
    champPrix.value = '650';
    champPrix.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonSauverTarif = racine.querySelector('.tarif-modal__actions .btn--primary') as HTMLButtonElement;
    expect(boutonSauverTarif.disabled).toBe(false);
    boutonSauverTarif.click();
    fixture.detectChanges();

    // Pendant l'attente réseau : spinner affiché, bouton désactivé.
    expect(boutonSauverTarif.disabled).toBe(true);
    expect(boutonSauverTarif.querySelector('.pi-spin')).toBeTruthy();

    resolverTarif(tarif({ prixM3: 650 }));
    await flush();
    fixture.detectChanges();

    expect(updateTarif).toHaveBeenCalledWith(650, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(sheet.classList).not.toContain('bs-sheet--open');
    expect(racine.querySelector('.tarif-current__value')?.textContent).toContain('650');
  });

  it('annule l’édition du tarif sans appeler le service et referme la modale', async () => {
    const { fixture, updateTarif } = await monterEtCharger();
    const racine = fixture.nativeElement as HTMLElement;

    (racine.querySelector('.tarif-row .btn--dark-outline') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((racine.querySelector('.bs-sheet') as HTMLElement).classList).toContain('bs-sheet--open');

    (racine.querySelector('.tarif-modal__actions .btn--ghost') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(updateTarif).not.toHaveBeenCalled();
    expect((racine.querySelector('.bs-sheet') as HTMLElement).classList).not.toContain('bs-sheet--open');
  });
});

describe('ConfigurationComponent — WhatsApp : test d’envoi et révocation (DOM)', () => {
  it('teste l’envoi WhatsApp depuis un vrai input : bouton en cours puis résultat affiché', async () => {
    let resolverTest!: (v: { success: boolean; message: string }) => void;
    const attente = new Promise<{ success: boolean; message: string }>((resolve) => {
      resolverTest = resolve;
    });
    const testerEnvoiWhatsapp = vi.fn().mockReturnValue(attente);
    const { fixture } = await monterEtCharger({ testerEnvoiWhatsapp });
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 3);

    const champTest = racine.querySelector('#wa-test') as HTMLInputElement;
    champTest.value = '612345678';
    champTest.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const boutonTest = racine.querySelector('.wa-number-row button') as HTMLButtonElement;
    boutonTest.click();
    fixture.detectChanges();

    expect(boutonTest.disabled).toBe(true);
    expect(boutonTest.querySelector('.pi-spin')).toBeTruthy();

    resolverTest({ success: true, message: 'Message envoyé' });
    await flush();
    fixture.detectChanges();

    expect(testerEnvoiWhatsapp).toHaveBeenCalledWith('+237612345678');
    const resultat = racine.querySelector('.test-result');
    expect(resultat?.classList.contains('test-result--ok')).toBe(true);
    expect(resultat?.textContent).toContain('Message envoyé');
    expect(boutonTest.disabled).toBe(false);
  });

  it('affiche un résultat en échec (classe --ko) quand le serveur refuse l’envoi', async () => {
    const testerEnvoiWhatsapp = vi.fn().mockResolvedValue({ success: false, message: 'WhatsApp non connecté' });
    const { fixture } = await monterEtCharger({ testerEnvoiWhatsapp });
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 3);

    const champTest = racine.querySelector('#wa-test') as HTMLInputElement;
    champTest.value = '612345678';
    champTest.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (racine.querySelector('.wa-number-row button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    const resultat = racine.querySelector('.test-result');
    expect(resultat?.classList.contains('test-result--ko')).toBe(true);
    expect(resultat?.textContent).toContain('WhatsApp non connecté');
  });

  it('révoque les tokens après confirmation (DOM), avec spinner pendant l’opération', async () => {
    let resolverRevoke!: (n: number) => void;
    const attente = new Promise<number>((resolve) => {
      resolverRevoke = resolve;
    });
    const revoquerTousTokensAbonnes = vi.fn().mockReturnValue(attente);
    const { fixture, confirmationService } = await monterEtCharger({ revoquerTousTokensAbonnes });
    const racine = fixture.nativeElement as HTMLElement;

    await cliquerOnglet(fixture, 3);

    vi.spyOn(confirmationService, 'confirm');
    const boutonRevoke = racine.querySelector('.revoke-row button') as HTMLButtonElement;
    boutonRevoke.click();
    fixture.detectChanges();

    expect(revoquerTousTokensAbonnes).not.toHaveBeenCalled(); // pas avant confirmation

    const options = (confirmationService.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
    options.accept();
    fixture.detectChanges();

    expect(boutonRevoke.disabled).toBe(true);
    expect(boutonRevoke.querySelector('.pi-spin')).toBeTruthy();

    resolverRevoke(4);
    await flush();
    fixture.detectChanges();

    expect(boutonRevoke.disabled).toBe(false);
    const toast = TestBed.inject(ToastService) as unknown as { success: ReturnType<typeof vi.fn> };
    expect(toast.success).toHaveBeenCalled();
  });
});
