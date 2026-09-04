import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EnvoisPanelComponent } from './envois-panel.component';
import type { EnvoiFacture } from '../../../../graphql/vues';

/**
 * Carte « Journal WhatsApp » de la fiche facture — purement présentationnelle.
 * Ces tests portent sur ce que l'écran affiche à partir du journal brut (statut,
 * type, message d'erreur nettoyé) et sur le seul événement qu'elle remonte au
 * parent : rejouer un envoi précis.
 */
function envoi(p: Partial<EnvoiFacture> = {}): EnvoiFacture {
  return {
    envoiId: 'e-1',
    statut: 'ENVOYE',
    dateEnvoi: '2026-08-01T10:00:00Z',
    typeEnvoi: 'FACTURE',
    erreur: '',
    ...p,
  } as EnvoiFacture;
}

function monter(envois: EnvoiFacture[], renvoiEnCours: string | null = null) {
  TestBed.configureTestingModule({
    imports: [EnvoisPanelComponent],
    providers: [provideTranslateService({})],
  });
  const fixture = TestBed.createComponent(EnvoisPanelComponent);
  fixture.componentRef.setInput('envois', envois);
  fixture.componentRef.setInput('renvoiEnCours', renvoiEnCours);
  fixture.detectChanges();
  const racine = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    c: fixture.componentInstance,
    racine,
    entries: () => [...racine.querySelectorAll('.journal-entry')] as HTMLElement[],
    retryButtons: () => [...racine.querySelectorAll('.journal-entry__retry')] as HTMLButtonElement[],
  };
}

describe('EnvoisPanelComponent', () => {
  it('n’affiche aucune carte quand le journal est vide', () => {
    const { racine } = monter([]);
    expect(racine.querySelector('.detail-card')).toBeNull();
  });

  it('affiche une entrée par envoi', () => {
    const { entries } = monter([envoi({ envoiId: 'e-1' }), envoi({ envoiId: 'e-2' })]);
    expect(entries()).toHaveLength(2);
  });

  it('remonte l’id exact de l’envoi sur clic « renvoyer »', () => {
    const { c, retryButtons } = monter([envoi({ envoiId: 'e-42' })]);
    const recus: string[] = [];
    c.rejouer.subscribe((id) => recus.push(id));
    retryButtons()[0].click();
    expect(recus).toEqual(['e-42']);
  });

  it('désactive uniquement le bouton de l’envoi en cours de renvoi', () => {
    const { retryButtons } = monter(
      [envoi({ envoiId: 'e-1' }), envoi({ envoiId: 'e-2' })],
      'e-2',
    );
    const [b1, b2] = retryButtons();
    expect(b1.disabled).toBe(false);
    expect(b2.disabled).toBe(true);
  });

  it('affiche le message d’erreur nettoyé pour un envoi en échec', () => {
    const { racine } = monter([
      envoi({ statut: 'ECHEC', erreur: 'Timeout (https://api.whatsapp.example/send?x=1) réessayer' }),
    ]);
    const err = racine.querySelector('.journal-entry__err');
    expect(err?.textContent).toContain('Timeout');
    expect(err?.textContent).not.toContain('https://');
  });

  it('ne montre pas de ligne d’erreur pour un envoi réussi', () => {
    const { racine } = monter([envoi({ statut: 'ENVOYE', erreur: '' })]);
    expect(racine.querySelector('.journal-entry__err')).toBeNull();
  });
});

describe('EnvoisPanelComponent — logique pure', () => {
  function creer() {
    TestBed.configureTestingModule({
      imports: [EnvoisPanelComponent],
      providers: [provideTranslateService({})],
    });
    return TestBed.createComponent(EnvoisPanelComponent).componentInstance;
  }

  it('formatDate renvoie un tiret pour une date vide', () => {
    expect(creer().formatDate('')).toBe('—');
  });

  it('formatDate formate au format jour/mois/année', () => {
    expect(creer().formatDate('2026-03-05T00:00:00Z')).toMatch(/05\/03\/2026|04\/03\/2026/);
  });

  it('envoiClass marque une erreur en priorité, même sur un type de rappel', () => {
    const c = creer();
    expect(c.envoiClass(envoi({ erreur: 'boom', typeEnvoi: 'RAPPEL' }))).toBe('journal-entry--error');
  });

  it('envoiClass avertit sur un rappel sans erreur', () => {
    const c = creer();
    expect(c.envoiClass(envoi({ erreur: '', typeEnvoi: 'RAPPEL_1' }))).toBe('journal-entry--warn');
  });

  it('envoiClass marque une alerte sur un avertissement', () => {
    const c = creer();
    expect(c.envoiClass(envoi({ erreur: '', typeEnvoi: 'AVERTISSEMENT' }))).toBe('journal-entry--error');
  });

  it('envoiClass est neutre pour une facture simple sans erreur', () => {
    const c = creer();
    expect(c.envoiClass(envoi({ erreur: '', typeEnvoi: 'FACTURE' }))).toBe('');
  });

  it('envoiStatutLabel déduit ECHEC d’une erreur même sans statut', () => {
    const c = creer();
    // Sans traduction chargée, `instant` renvoie la clé — c'est elle qu'on vérifie.
    expect(c.envoiStatutLabel(envoi({ statut: '', erreur: 'boom' }))).toContain('ECHEC');
  });

  it('envoiTypeLabel retombe sur FACTURE quand le type est absent', () => {
    const c = creer();
    expect(c.envoiTypeLabel(envoi({ typeEnvoi: undefined }))).toContain('FACTURE');
  });

  it('cleanErreur tronque les messages trop longs', () => {
    const c = creer();
    const long = 'x'.repeat(200);
    const nettoye = c.cleanErreur(long);
    expect(nettoye.length).toBe(120);
    expect(nettoye.endsWith('…')).toBe(true);
  });

  it('cleanErreur retire les URLs et compresse les espaces', () => {
    const c = creer();
    expect(c.cleanErreur('Erreur   (http://x.test/a/b)   réseau')).toBe('Erreur réseau');
  });
});
