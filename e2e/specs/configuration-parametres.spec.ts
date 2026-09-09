import { test, expect } from '@playwright/test';

/**
 * Modification d'un paramètre système (`UpdateConfig`, ADMIN uniquement —
 * `/configuration`). Module Configuration : ZÉRO couverture e2e avant ce spec.
 *
 * Retenu : l'e-mail de notification admin (`email_admin_notifications`, onglet
 * « Relances & Impayés »), PAS le tarif (`UpdateTarif` — « un seul tarif actif
 * à la fois, non rétroactif », changer puis remettre l'ancien laisserait un
 * historique de deux entrées sans mutation de suppression) ni les infos
 * société (`UpdateInfosSociete` — s'impriment sur les factures PDF et messages
 * WhatsApp émis PENDANT la fenêtre du test). Un simple champ texte mémorisé,
 * sans effet immédiat déclenché à l'enregistrement : round-trip lecture →
 * modification → vérification → remise à la valeur initiale dans le même test,
 * donc rejouable sans dérive de configuration.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Configuration — paramètres système', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin modifie l'email de notification puis le restaure", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran ADMIN desktop — cohérent avec les autres specs back-office.',
    );

    const username = process.env.E2E_ADMIN_USER;
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'E2E_ADMIN_USER / E2E_ADMIN_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }

    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/configuration');
    await page.locator('.config-tabs__tab', { hasText: 'Relances & Impayés' }).click();

    const email = page.locator('#notif-email');
    await expect(email).toBeVisible({ timeout: 15_000 });
    const valeurOriginale = await email.inputValue();

    const saveBtn = page.locator('.config-save');
    const nouvelleValeur = `e2e-test-${Date.now()}@sgfe.local`;

    await email.fill(nouvelleValeur);
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Modifications enregistrées' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(email).toHaveValue(nouvelleValeur);

    // ── Remise à l'état initial, dans le même test ──────────────────────────
    await email.fill(valeurOriginale);
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Modifications enregistrées' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(email).toHaveValue(valeurOriginale);
  });
});
