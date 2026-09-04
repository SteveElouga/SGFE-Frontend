import { test, expect } from '@playwright/test';

/**
 * Consultation du tableau de bord — vues ADMIN et COMPTABLE (`/dashboard`).
 *
 * Comme `terrain-saisie-index.spec.ts`, ce parcours ne peut PAS se passer d'un
 * vrai backend : `DashboardComponent.load()` agrège six sources GraphQL
 * distinctes (`stats`, `statsParMois`, `campagnes`, `impayes`, `paiements`,
 * `factures`, `envois` — voir `core/dashboard/dashboard.service.ts`) dont les
 * calculs dérivés (deltas période, ribbon 4 KPI, top 5 impayés) n'ont de sens
 * qu'avec de vraies données émises par les microservices concernés. Les
 * mocker reviendrait à retester le gabarit contre des données inventées, pas
 * le tableau de bord — exactement la même limite documentée en tête de
 * `terrain-saisie-index.spec.ts`.
 *
 * ── Ce qui est vérifié ──────────────────────────────────────────────────────
 * `DashboardComponent.viewMode` bascule le rendu selon le rôle
 * (`comptable`/`admin`/`superviseur`, voir `dashboard.component.ts`) : ce
 * spec confirme que chaque rôle voit bien SA composition, pas un écran
 * générique ou celui d'un autre rôle — jamais vérifié jusqu'ici.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que `terrain-saisie-index.spec.ts` : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible. Ce spec
 * se neutralise avec `test.skip(...)` tant que `E2E_LIVE_BACKEND` n'est pas
 * posée — voir e2e/README.md.
 *
 * Prérequis : au moins une campagne et une facture existantes dans le tenant
 * (n'importe quel statut convient — ce spec ne vérifie pas de valeur précise,
 * seulement que chaque vue rend sa composition propre). Purement en lecture :
 * aucune donnée n'est créée ni modifiée.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Dashboard — consultation par rôle', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le COMPTABLE voit le héros FCFA et les 3 KPI secondaires', async ({ page }) => {
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

    // Héros "où est l'argent" — propre à la vue Comptable, absent des autres vues.
    await expect(page.locator('.dash-hero')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.dash-hero__count')).toBeVisible();

    // Le ribbon 4-KPI (vue Admin) ne doit PAS apparaître ici — sinon les deux
    // vues fuient l'une dans l'autre.
    await expect(page.locator('.dash-ribbon')).toHaveCount(0);
  });

  test("l'ADMIN voit le ribbon 4-KPI du cycle en cours et les mesures du mois", async ({
    page,
  }) => {
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

    // Ribbon "cycle en cours" (relevés → factures → envois → paiements) —
    // propre à la vue Admin, rendu sans condition dès que viewMode === 'admin'.
    await expect(page.locator('.dash-ribbon')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.dash-step')).not.toHaveCount(0);

    // Le héros FCFA Comptable ne doit PAS apparaître ici.
    await expect(page.locator('.dash-hero')).toHaveCount(0);
  });
});
