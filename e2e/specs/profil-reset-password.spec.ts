import { test, expect } from '@playwright/test';

/**
 * Demande de réinitialisation de mot de passe depuis le profil
 * (`RequestPasswordReset`, tout rôle authentifié — `/profil` n'a pas de
 * `roleGuard`). Module Profil : ZÉRO couverture e2e avant ce spec.
 *
 * Il n'existe structurellement aucune mutation `changePassword` en self-service
 * (voir le commentaire de `ProfilComponent.requestPasswordReset` : « L'API
 * n'expose pas de changement de mot de passe self-service ») — le SEUL geste
 * d'écriture possible sur cet écran est donc l'envoi d'un lien de
 * réinitialisation. C'est intrinsèquement sûr pour les autres specs qui
 * réutilisent le même compte ADMIN : cliquer ce bouton n'altère JAMAIS le mot
 * de passe actuel, seul le fait de suivre le lien recu le changerait — ce que
 * ce spec ne fait jamais.
 *
 * ⚠️ Un e-mail est réellement envoyé (Brevo) à l'adresse enregistrée sur le
 * compte. Vérifié avant d'écrire ce spec : l'e-mail de `demo_admin`
 * (`demo_admin@sgfe.local`) est sur un domaine `.local`, non routable sur
 * l'internet public — l'envoi échoue ou n'atteint personne, sans risque de
 * spam vers une vraie boîte. Ce spec suppose que le compte ADMIN utilisé porte
 * un e-mail de test de ce type ; à vérifier avant de le lancer contre un autre
 * environnement.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Profil — demande de réinitialisation du mot de passe', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin demande un lien de réinitialisation depuis son profil", async ({ page }) => {
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

    await page.goto('/profil');
    const resetBtn = page.locator('.btn--outline', { hasText: 'Recevoir un lien de réinitialisation' });
    await expect(resetBtn).toBeVisible({ timeout: 15_000 });
    await expect(resetBtn).toBeEnabled();
    await resetBtn.click();

    await expect(
      page.locator('.toast.toast--success .toast__title', {
        hasText: 'Lien de réinitialisation envoyé par email.',
      }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.profil-reset-done')).toBeVisible();
  });
});
