import { computed, signal } from '@angular/core';

export interface CooldownHandle {
  readonly resendCooldown: ReturnType<typeof signal<number>>;
  readonly cooldownDisplay: ReturnType<typeof computed<string | null>>;
  startCooldown(seconds?: number): void;
  destroy(): void;
}

export function createCooldown(defaultSeconds = 600): CooldownHandle {
  const resendCooldown = signal(0);
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;

  const cooldownDisplay = computed(() => {
    const s = resendCooldown();
    if (s === 0) return null;
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  });

  function startCooldown(seconds = defaultSeconds): void {
    if (cooldownTimer) clearInterval(cooldownTimer);
    resendCooldown.set(seconds);
    cooldownTimer = setInterval(() => {
      const remaining = resendCooldown() - 1;
      if (remaining <= 0) {
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = null;
        resendCooldown.set(0);
      } else {
        resendCooldown.set(remaining);
      }
    }, 1000);
  }

  function destroy(): void {
    if (cooldownTimer) clearInterval(cooldownTimer);
  }

  return { resendCooldown, cooldownDisplay, startCooldown, destroy };
}
