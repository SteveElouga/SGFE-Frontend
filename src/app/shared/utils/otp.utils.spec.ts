import { createCooldown } from './otp.utils';

describe('createCooldown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('démarre à zéro, sans affichage', () => {
    const c = createCooldown();
    expect(c.resendCooldown()).toBe(0);
    expect(c.cooldownDisplay()).toBeNull();
    c.destroy();
  });

  it('startCooldown() sans argument utilise la valeur par défaut (600 s → 10:00)', () => {
    const c = createCooldown();
    c.startCooldown();
    expect(c.resendCooldown()).toBe(600);
    expect(c.cooldownDisplay()).toBe('10:00');
    c.destroy();
  });

  it('startCooldown() accepte une durée explicite et l’affiche mm:ss avec padding', () => {
    const c = createCooldown();
    c.startCooldown(65);
    expect(c.cooldownDisplay()).toBe('1:05');
    c.destroy();
  });

  it('décompte chaque seconde', () => {
    const c = createCooldown();
    c.startCooldown(3);
    vi.advanceTimersByTime(1000);
    expect(c.resendCooldown()).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(c.resendCooldown()).toBe(1);
    c.destroy();
  });

  it('s’arrête à zéro et efface l’affichage', () => {
    const c = createCooldown();
    c.startCooldown(2);
    vi.advanceTimersByTime(2000);
    expect(c.resendCooldown()).toBe(0);
    expect(c.cooldownDisplay()).toBeNull();

    // Le minuteur est bien arrêté : avancer encore ne fait pas descendre sous zéro.
    vi.advanceTimersByTime(5000);
    expect(c.resendCooldown()).toBe(0);
    c.destroy();
  });

  it('un second startCooldown() remplace le minuteur en cours, sans double décompte', () => {
    const c = createCooldown();
    c.startCooldown(10);
    vi.advanceTimersByTime(1000); // 9
    c.startCooldown(5); // relance à 5, l'ancien minuteur ne doit plus tourner

    vi.advanceTimersByTime(1000);
    expect(c.resendCooldown()).toBe(4); // un seul minuteur actif
    c.destroy();
  });

  it('destroy() stoppe le décompte', () => {
    const c = createCooldown();
    c.startCooldown(5);
    c.destroy();
    vi.advanceTimersByTime(3000);
    expect(c.resendCooldown()).toBe(5); // inchangé, plus aucun minuteur ne tourne
  });
});
