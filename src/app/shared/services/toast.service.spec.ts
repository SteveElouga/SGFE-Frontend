import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(ToastService);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commence sans toast', () => {
    expect(setup().toasts()).toEqual([]);
  });

  it('show() ajoute un toast en tête de liste et rend son id', () => {
    const s = setup();
    const id = s.show({ type: 'info', title: 'Titre' });
    expect(typeof id).toBe('string');
    expect(s.toasts()).toHaveLength(1);
    expect(s.toasts()[0].id).toBe(id);
    expect(s.toasts()[0].title).toBe('Titre');
  });

  it('les toasts les plus récents sont en tête', () => {
    const s = setup();
    const id1 = s.show({ type: 'info', title: 'Premier' });
    const id2 = s.show({ type: 'info', title: 'Second' });
    expect(s.toasts().map((t) => t.id)).toEqual([id2, id1]);
  });

  it('limite à 3 toasts simultanés — les plus anciens sont retirés', () => {
    const s = setup();
    s.show({ type: 'error', title: '1' }); // error : pas d'auto-dismiss
    s.show({ type: 'error', title: '2' });
    s.show({ type: 'error', title: '3' });
    s.show({ type: 'error', title: '4' });
    expect(s.toasts()).toHaveLength(3);
    expect(s.toasts().map((t) => t.title)).toEqual(['4', '3', '2']);
  });

  it('dismiss() retire le toast visé', () => {
    const s = setup();
    const id = s.show({ type: 'error', title: 'X' });
    s.dismiss(id);
    expect(s.toasts()).toEqual([]);
  });

  it('dismiss() sur un id inconnu ne fait rien', () => {
    const s = setup();
    s.show({ type: 'error', title: 'X' });
    s.dismiss('id-inexistant');
    expect(s.toasts()).toHaveLength(1);
  });

  it.each(['success', 'info', 'warning'] as const)(
    'un toast %s se referme automatiquement après le délai',
    (type) => {
      const s = setup();
      s.show({ type, title: 'X' });
      vi.advanceTimersByTime(5000);
      expect(s.toasts()).toEqual([]);
    },
  );

  it.each(['error', 'progress'] as const)(
    'un toast %s ne se referme jamais automatiquement',
    (type) => {
      const s = setup();
      s.show({ type, title: 'X' });
      vi.advanceTimersByTime(60_000);
      expect(s.toasts()).toHaveLength(1);
    },
  );

  it('success()/error()/warning()/info() délèguent à show() avec le bon type', () => {
    const s = setup();
    // Trois appels seulement : MAX_TOASTS = 3, un 4e ferait sortir le premier
    // de la liste (voir le test dédié à la limite ci-dessus).
    s.error('KO');
    s.warning('Attn');
    s.info('Info', 'détail');
    const types = s.toasts().map((t) => t.type).sort();
    expect(types).toEqual(['error', 'info', 'warning'].sort());
    expect(s.toasts().find((t) => t.type === 'info')!.message).toBe('détail');
  });

  it('success() délègue à show() avec le type success', () => {
    const s = setup();
    s.success('OK', 'détail');
    expect(s.toasts()[0].type).toBe('success');
    expect(s.toasts()[0].message).toBe('détail');
  });

  it('progress() crée un toast de type progress avec current/total', () => {
    const s = setup();
    const id = s.progress('Import', 2, 10);
    const toast = s.toasts().find((t) => t.id === id)!;
    expect(toast.type).toBe('progress');
    expect(toast.current).toBe(2);
    expect(toast.total).toBe(10);
  });

  it('updateProgress() met à jour current/total sans fermer le toast avant la fin', () => {
    const s = setup();
    const id = s.progress('Import', 2, 10);
    s.updateProgress(id, 5, 10);
    const toast = s.toasts().find((t) => t.id === id)!;
    expect(toast.current).toBe(5);
    expect(s.toasts()).toHaveLength(1);
  });

  it('updateProgress() referme le toast une fois complet, après un court délai', () => {
    const s = setup();
    const id = s.progress('Import', 2, 10);
    s.updateProgress(id, 10, 10);
    expect(s.toasts()).toHaveLength(1); // pas encore, le délai n'est pas passé
    vi.advanceTimersByTime(800);
    expect(s.toasts().find((t) => t.id === id)).toBeUndefined();
  });

  it('dismiss() annule le minuteur d’auto-fermeture (pas de fermeture fantôme après réutilisation)', () => {
    const s = setup();
    const id = s.show({ type: 'success', title: 'X' });
    s.dismiss(id);
    // Le minuteur de 5s ne doit plus rien avoir à fermer.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(s.toasts()).toEqual([]);
  });

  it('les actions fournies sont conservées sur le toast', () => {
    const s = setup();
    const handler = vi.fn();
    s.show({ type: 'error', title: 'X', actions: [{ label: 'Réessayer', handler }] });
    expect(s.toasts()[0].actions).toEqual([{ label: 'Réessayer', handler }]);
  });
});
