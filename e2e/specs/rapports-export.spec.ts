import { test, expect } from '@playwright/test';

/**
 * Export d'un rapport (`/rapports`, ADMIN et COMPTABLE). Module Rapports :
 * ZÉRO couverture e2e avant ce spec.
 *
 * Contrairement aux autres modules ajoutés dans cette itération, Rapports ne
 * porte AUCUNE mutation GraphQL : les 4 exports (`ExportsService`) sont des
 * flux binaires HTTP **hors GraphQL** (`GET` en `responseType: 'blob'`,
 * déclenchés en JS plutôt qu'un lien direct pour porter l'en-tête d'auth — voir
 * la docstring de `exports.service.ts`). C'est donc un test de LECTURE, mais
 * qui vérifie un vrai téléchargement de fichier plutôt qu'un simple rendu
 * d'écran — le geste le plus concret de ce module.
 *
 * `exportBilan()` (bilan des impayés, PDF, portée globale) est retenu : c'est
 * le seul des 4 exports sans précondition de campagne/période particulière.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Rapports — export du bilan des impayés', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le comptable télécharge le bilan des impayés en PDF', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran back-office desktop — pas de contrainte de layout ici, mais cohérent avec les autres specs back-office.',
    );

    const username = process.env.E2E_COMPTABLE_USER;
    const password = process.env.E2E_COMPTABLE_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'E2E_COMPTABLE_USER / E2E_COMPTABLE_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }

    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/rapports');
    const carteBilan = page.locator('.export-card', { hasText: 'Bilan des impayés' });
    await expect(carteBilan).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      carteBilan.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Export téléchargé' }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
