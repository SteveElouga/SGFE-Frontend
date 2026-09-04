import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../public/i18n/fr.json';
import { formatFcfa } from '../../shared/pipes/fcfa.pipe';
import { Role } from '../../shared/models/user.model';
import { AuthService } from '../auth/auth.service';
import { FacturesService } from '../factures/factures.service';
import { NotificationsService } from './notifications.service';

/**
 * Le centre de notifications n'a pas de backend dédié : il dérive tout de
 * trois sources déjà chargées ailleurs (envois, impayés, paiements). Ce qui
 * se joue ici, ce n'est pas l'affichage mais la sélection — quelles lignes
 * deviennent une notification — et la permission, silencieuse par construction
 * (un rôle refusé ne doit produire ni notification, ni appel réseau).
 *
 * Les traductions réelles (`public/i18n/fr.json`) sont chargées plutôt que
 * mockées : un message composé avec une clé absente ferait échouer le test,
 * comme dans `annuler-sheet.component.spec.ts`.
 */
const CLE_LUS = 'sgfe:notifications:lues';

function installerStockage(): Map<string, string> {
  const contenu = new Map<string, string>();
  const faux: Storage = {
    get length() { return contenu.size; },
    clear: () => contenu.clear(),
    getItem: (k: string) => (contenu.has(k) ? contenu.get(k)! : null),
    key: (i: number) => [...contenu.keys()][i] ?? null,
    removeItem: (k: string) => void contenu.delete(k),
    setItem: (k: string, v: string) => void contenu.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: faux });
  return contenu;
}

function setup(role: Role | null = 'ADMIN') {
  const contenu = installerStockage();
  const roleSignal = signal<Role | null>(role);
  const factures = {
    getAllEnvois: vi.fn().mockResolvedValue([]),
    getImpayes: vi.fn().mockResolvedValue([]),
    getAllPaiements: vi.fn().mockResolvedValue([]),
    getFactures: vi.fn().mockResolvedValue([]),
  };

  TestBed.configureTestingModule({
    providers: [
      provideTranslateService({ lang: 'fr', fallbackLang: 'fr' }),
      { provide: AuthService, useValue: { role: roleSignal } },
      { provide: FacturesService, useValue: factures },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('fr', fr as unknown as TranslationObject);
  translate.use('fr');

  const service = TestBed.inject(NotificationsService);
  return { service, factures, roleSignal, contenu };
}

describe('NotificationsService · permission par rôle', () => {
  it('ne charge rien pour un AGENT — la gateway refuserait les trois sources', async () => {
    const { service, factures } = setup('AGENT');
    await service.load();
    expect(factures.getAllEnvois).not.toHaveBeenCalled();
    expect(factures.getImpayes).not.toHaveBeenCalled();
    expect(factures.getAllPaiements).not.toHaveBeenCalled();
    expect(service.notifications()).toEqual([]);
  });

  it('ne charge rien pour un SUPERVISEUR', async () => {
    const { service, factures } = setup('SUPERVISEUR');
    await service.load();
    expect(factures.getAllEnvois).not.toHaveBeenCalled();
  });

  it('charge pour un ADMIN', async () => {
    const { service, factures } = setup('ADMIN');
    await service.load();
    expect(factures.getAllEnvois).toHaveBeenCalledTimes(1);
  });

  it('charge pour un COMPTABLE', async () => {
    const { service, factures } = setup('COMPTABLE');
    await service.load();
    expect(factures.getAllEnvois).toHaveBeenCalledTimes(1);
  });

  it('load() est idempotent : un second appel ne relance pas les requêtes', async () => {
    const { service, factures } = setup('ADMIN');
    await service.load();
    await service.load();
    expect(factures.getAllEnvois).toHaveBeenCalledTimes(1);
  });

  it('refresh() force un nouveau chargement', async () => {
    const { service, factures } = setup('ADMIN');
    await service.load();
    await service.refresh();
    expect(factures.getAllEnvois).toHaveBeenCalledTimes(2);
  });

  it('un échec d’une des sources ne fait pas échouer load() (best-effort)', async () => {
    const { service, factures } = setup('ADMIN');
    factures.getAllEnvois.mockRejectedValue(new Error('réseau'));
    await expect(service.load()).resolves.toBeUndefined();
  });
});

describe('NotificationsService · composition des notifications', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(2026, 7, 27, 12, 0, 0);

  beforeEach(() => vi.setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  function iso(offsetMs: number): string {
    return new Date(now.getTime() - offsetMs).toISOString();
  }

  function fixtures() {
    const dateEnvoiEchec = iso(3 * DAY);
    const datePaiementRecent = iso(2 * DAY);
    const datePaiementAncien = iso(10 * DAY);

    return {
      envois: [
        {
          envoiId: 'e1', statut: 'ECHEC', factureId: 'f1',
          dateEnvoi: dateEnvoiEchec, raisonEchec: 'Numéro invalide', erreur: null,
        },
        { envoiId: 'e2', statut: 'ENVOYE', factureId: 'f2', dateEnvoi: iso(DAY), raisonEchec: null, erreur: null },
      ],
      impayes: [
        { factureId: 'f2', soldeRestant: 5_000 },
        { factureId: 'f3', soldeRestant: 0 }, // soldé : pas de notification
      ],
      paiements: [
        { paiementId: 'p1', factureId: 'f4', datePaiement: datePaiementRecent, montant: 3_000, annule: false },
        { paiementId: 'p2', factureId: 'f5', datePaiement: datePaiementAncien, montant: 1_000, annule: false }, // > 7 jours
        { paiementId: 'p3', factureId: 'f4', datePaiement: datePaiementRecent, montant: 500, annule: true }, // annulé
        { paiementId: 'p4', factureId: 'f6', datePaiement: 'date-invalide', montant: 10, annule: false }, // illisible
      ],
      factures: [
        { factureId: 'f1', abonneNom: 'Jean Dupont', abonneNumero: 'AB-01', numeroFacture: 'F-001', dateLimitePaiement: '2026-08-10' },
        { factureId: 'f2', abonneNom: '', abonneNumero: 'AB-02', numeroFacture: 'F-002', dateLimitePaiement: '2026-08-15' },
        { factureId: 'f4', abonneNom: 'Awa Ngo', abonneNumero: 'AB-04', numeroFacture: 'F-004', dateLimitePaiement: '2026-08-20' },
      ],
      dateEnvoiEchec,
      datePaiementRecent,
    };
  }

  async function charger() {
    const f = fixtures();
    const { service, factures } = setup('ADMIN');
    factures.getAllEnvois.mockResolvedValue(f.envois);
    factures.getImpayes.mockResolvedValue(f.impayes);
    factures.getAllPaiements.mockResolvedValue(f.paiements);
    factures.getFactures.mockResolvedValue(f.factures);
    await service.load();
    return { service, f };
  }

  it('un envoi ENVOYE ne produit aucune notification, seul ECHEC en produit une', async () => {
    const { service } = await charger();
    const envois = service.notifications().filter((n) => n.id.startsWith('envoi:'));
    expect(envois).toHaveLength(1);
    expect(envois[0].id).toBe('envoi:e1');
  });

  it('la notification d’échec WhatsApp porte le bon nom, la bonne facture et le bon motif', async () => {
    const { service, f } = await charger();
    const n = service.notifications().find((x) => x.id === 'envoi:e1')!;
    expect(n.tone).toBe('danger');
    expect(n.category).toBe('SYSTEME');
    expect(n.icon).toBe('pi-whatsapp');
    expect(n.title).toBe("Échec d'envoi WhatsApp");
    expect(n.message).toBe('Jean Dupont · F-001 : Numéro invalide. Renvoi manuel requis.');
    expect(n.createdAt).toBe(f.dateEnvoiEchec);
    expect(n.actions?.map((a) => a.type)).toEqual(['RETRY', 'FIX_NUMBER']);
  });

  it('un échec sans raison connue retombe sur le motif générique traduit', async () => {
    const { service, factures } = setup('ADMIN');
    factures.getAllEnvois.mockResolvedValue([
      { envoiId: 'e9', statut: 'ECHEC', factureId: 'fx', dateEnvoi: iso(0), raisonEchec: null, erreur: null },
    ]);
    factures.getFactures.mockResolvedValue([]);
    await service.load();
    const n = service.notifications().find((x) => x.id === 'envoi:e9')!;
    expect(n.message).toContain('motif non communiqué par la passerelle');
  });

  it('une facture au solde nul ne produit pas de notification d’impayé', async () => {
    const { service } = await charger();
    expect(service.notifications().some((n) => n.id === 'impaye:f3')).toBe(false);
  });

  it('une facture au solde positif produit une notification d’impayé, avec le nom retombant sur la référence si le nom est vide', async () => {
    const { service } = await charger();
    const n = service.notifications().find((x) => x.id === 'impaye:f2')!;
    expect(n.tone).toBe('warning');
    expect(n.category).toBe('RELANCES');
    expect(n.title).toBe('Facture impayée');
    expect(n.message).toBe(`AB-02 · F-002 : solde restant ${formatFcfa(5_000)}.`);
  });

  it('un paiement annulé ne produit pas de notification', async () => {
    const { service } = await charger();
    expect(service.notifications().some((n) => n.id === 'paiement:p3')).toBe(false);
  });

  it('un paiement vieux de plus de 7 jours ne produit pas de notification', async () => {
    const { service } = await charger();
    expect(service.notifications().some((n) => n.id === 'paiement:p2')).toBe(false);
  });

  it('un paiement à la date illisible ne produit pas de notification', async () => {
    const { service } = await charger();
    expect(service.notifications().some((n) => n.id === 'paiement:p4')).toBe(false);
  });

  it('un paiement récent et non annulé produit une notification avec le montant formaté', async () => {
    const { service, f } = await charger();
    const n = service.notifications().find((x) => x.id === 'paiement:p1')!;
    expect(n.tone).toBe('success');
    expect(n.category).toBe('PAIEMENTS');
    expect(n.message).toBe(`${formatFcfa(3_000)} · Awa Ngo · F-004.`);
    expect(n.createdAt).toBe(f.datePaiementRecent);
    expect(n.actions?.map((a) => a.type)).toEqual(['VIEW_RECEIPT']);
  });

  it('les notifications sont triées de la plus récente à la plus ancienne', async () => {
    const { service } = await charger();
    const dates = service.notifications().map((n) => n.createdAt);
    const trie = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(trie);
  });

  it('total() et unreadCount() reflètent l’ensemble tant que rien n’est lu', async () => {
    const { service } = await charger();
    expect(service.total()).toBe(service.notifications().length);
    expect(service.unreadCount()).toBe(service.total());
  });
});

describe('NotificationsService · état « lu »', () => {
  async function chargerUneNotification() {
    const { service, factures, contenu } = setup('ADMIN');
    factures.getAllEnvois.mockResolvedValue([
      { envoiId: 'e1', statut: 'ECHEC', factureId: 'f1', dateEnvoi: new Date().toISOString(), raisonEchec: 'x', erreur: null },
    ]);
    factures.getFactures.mockResolvedValue([]);
    await service.load();
    return { service, contenu };
  }

  it('markRead() marque une seule notification comme lue', async () => {
    const { service, factures } = setup('ADMIN');
    factures.getAllEnvois.mockResolvedValue([
      { envoiId: 'e1', statut: 'ECHEC', factureId: 'f1', dateEnvoi: new Date().toISOString(), raisonEchec: 'x', erreur: null },
      { envoiId: 'e2', statut: 'ECHEC', factureId: 'f2', dateEnvoi: new Date().toISOString(), raisonEchec: 'y', erreur: null },
    ]);
    factures.getFactures.mockResolvedValue([]);
    await service.load();

    service.markRead('envoi:e1');

    expect(service.notifications().find((n) => n.id === 'envoi:e1')!.read).toBe(true);
    expect(service.notifications().find((n) => n.id === 'envoi:e2')!.read).toBe(false);
    expect(service.unreadCount()).toBe(1);
  });

  it('markRead() persiste l’id lu en localStorage', async () => {
    const { service, contenu } = await chargerUneNotification();
    service.markRead('envoi:e1');
    const lus = JSON.parse(contenu.get(CLE_LUS)!) as string[];
    expect(lus).toContain('envoi:e1');
  });

  it('markAllRead() marque tout comme lu et vide le compteur', async () => {
    const { service, factures } = setup('ADMIN');
    factures.getAllEnvois.mockResolvedValue([
      { envoiId: 'e1', statut: 'ECHEC', factureId: 'f1', dateEnvoi: new Date().toISOString(), raisonEchec: 'x', erreur: null },
      { envoiId: 'e2', statut: 'ECHEC', factureId: 'f2', dateEnvoi: new Date().toISOString(), raisonEchec: 'y', erreur: null },
    ]);
    factures.getFactures.mockResolvedValue([]);
    await service.load();

    service.markAllRead();

    expect(service.unreadCount()).toBe(0);
    expect(service.notifications().every((n) => n.read)).toBe(true);
  });

  it('l’état lu persiste à travers un rechargement (refresh)', async () => {
    const { service, factures } = setup('ADMIN');
    const envoi = { envoiId: 'e1', statut: 'ECHEC', factureId: 'f1', dateEnvoi: new Date().toISOString(), raisonEchec: 'x', erreur: null };
    factures.getAllEnvois.mockResolvedValue([envoi]);
    factures.getFactures.mockResolvedValue([]);
    await service.load();
    service.markRead('envoi:e1');

    await service.refresh();

    expect(service.notifications().find((n) => n.id === 'envoi:e1')!.read).toBe(true);
  });
});

describe('NotificationsService · groupOf', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(2026, 7, 27, 9, 0, 0);

  beforeEach(() => vi.setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  function iso(offsetMs: number): string {
    return new Date(now.getTime() - offsetMs).toISOString();
  }

  it('rend OLDER pour une date absente ou illisible', () => {
    const { service } = setup('ADMIN');
    expect(service.groupOf('')).toBe('OLDER');
    expect(service.groupOf('pas-une-date')).toBe('OLDER');
  });

  it('range dans TODAY une date du jour même', () => {
    const { service } = setup('ADMIN');
    expect(service.groupOf(iso(5 * 60 * 1000))).toBe('TODAY');
  });

  it('range dans YESTERDAY une date de la veille', () => {
    const { service } = setup('ADMIN');
    expect(service.groupOf(iso(DAY))).toBe('YESTERDAY');
  });

  it('range dans WEEK une date de moins de 7 jours, ni aujourd’hui ni hier', () => {
    const { service } = setup('ADMIN');
    expect(service.groupOf(iso(3 * DAY))).toBe('WEEK');
  });

  it('range dans OLDER une date de plus de 7 jours', () => {
    const { service } = setup('ADMIN');
    expect(service.groupOf(iso(10 * DAY))).toBe('OLDER');
  });
});

describe('NotificationsService · relativeTime', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const now = new Date(2026, 7, 27, 9, 0, 0);

  beforeEach(() => vi.setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  function iso(offsetMs: number): string {
    return new Date(now.getTime() - offsetMs).toISOString();
  }

  it('rend une chaîne vide pour une date illisible ou absente', () => {
    const { service } = setup('ADMIN');
    expect(service.relativeTime('')).toBe('');
    expect(service.relativeTime('pas-une-date')).toBe('');
  });

  it('« à l’instant » sous la minute', () => {
    const { service } = setup('ADMIN');
    expect(service.relativeTime(iso(30 * 1000))).toBe("à l'instant");
  });

  it('les minutes, sous l’heure', () => {
    const { service } = setup('ADMIN');
    expect(service.relativeTime(iso(5 * 60 * 1000))).toBe('il y a 5 min');
  });

  it('les heures, au-delà, tant que c’est le même jour calendaire', () => {
    const { service } = setup('ADMIN');
    expect(service.relativeTime(iso(3 * HOUR))).toBe('il y a 3 h');
  });

  it('« Hier · HH:mm » pour la veille', () => {
    const { service } = setup('ADMIN');
    const hier = new Date(now.getTime() - DAY);
    const heure = hier.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    expect(service.relativeTime(iso(DAY))).toBe(`Hier · ${heure}`);
  });

  it('le jour de la semaine, abrégé et capitalisé, en deçà de 7 jours', () => {
    const { service } = setup('ADMIN');
    const date = new Date(now.getTime() - 3 * DAY);
    const attendu = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    const capitalise = attendu.charAt(0).toUpperCase() + attendu.slice(1);
    expect(service.relativeTime(iso(3 * DAY))).toBe(capitalise);
  });

  it('jour/mois au-delà de 7 jours', () => {
    const { service } = setup('ADMIN');
    const date = new Date(now.getTime() - 10 * DAY);
    const attendu = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    expect(service.relativeTime(iso(10 * DAY))).toBe(attendu);
  });
});
