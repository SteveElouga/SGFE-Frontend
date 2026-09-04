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
      { provide: Apollo, useValue: { subscribe: over.subscribe ?? vi.fn().mockReturnValue(of({ data: {} })), query: vi.fn() } },
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
