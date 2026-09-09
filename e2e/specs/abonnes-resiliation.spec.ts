import { test, expect } from '@playwright/test';
import { genererNumeroCompteur } from '../fixtures/numero-compteur.util';

/**
 * Résiliation d'un abonné (`ResilierAbonne`, ADMIN uniquement — voir
 * `app.routes.ts::roleGuard(['ADMIN'])` sur `/abonnes`).
 *
 * C'est le trou de couverture le plus sévère signalé par l'audit « Radiographie
 * SGFE » (09/09/2026) : `abonnes-gestion.spec.ts` reste volontairement en
 * LECTURE SEULE (liste, recherche, fiche), et aucune des mutations de gestion
 * d'un abonné (suspendre, réactiver, résilier, remplacer un compteur) n'était
 * jusqu'ici rejouée contre un vrai backend.
 *
 * ── Abonné jetable, créé par le test lui-même ───────────────────────────────
 * La résiliation est DÉFINITIVE (`resilierAbonne` refuse une 2ᵉ tentative sur
 * le même compte : `ValidationError("Cet abonné est déjà résilié")`) — donc,
 * contrairement à `abonnes-gestion.spec.ts` qui doit chercher un abonné existant
 * du jeu de données, ce spec commence par CRÉER son propre abonné via le
 * formulaire réel (`/abonnes/nouveau`) avant de le résilier. Deux bénéfices :
 * le test est intégralement autonome (rejouable indéfiniment, jamais à court
 * de « budget » de compte comme `terrain-saisie-index.spec.ts`), et il couvre
 * au passage la création d'un abonné — également listée « pas encore couverte »
 * par l'audit.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible. Ce spec se
 * neutralise avec `test.skip(...)` tant que `E2E_LIVE_BACKEND` n'est pas posée —
 * voir e2e/README.md.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Abonnés — résiliation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin crée un abonné puis le résilie définitivement", async ({ page }, testInfo) => {
    // ADMIN est un rôle back-office desktop — `/abonnes` utilise les sélecteurs
    // de la vue tableau (`.dt__row`), masquée sous 1024px (voir
    // `abonnes-gestion.spec.ts` pour la même contrainte, déjà vérifiée).
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran ADMIN desktop — sélecteurs de tableau masqués sur mobile.',
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

    // ── Création d'un abonné jetable, identifiable de façon unique ──────────
    const marqueur = `E2ERES${Date.now().toString(36).toUpperCase()}`;
    const telephone = `6${String(Date.now()).slice(-8)}`;
    const numeroCompteur = genererNumeroCompteur(testInfo);

    await page.goto('/abonnes/nouveau');
    // `exact: true` : « Prénom * » se termine par « nom * » et matcherait sinon
    // aussi la recherche substring insensible à la casse de « Nom * ».
    await page.getByLabel('Nom *', { exact: true }).fill(marqueur);
    await page.getByLabel('Prénom *').fill('Playwright');
    await page.getByLabel('Quartier *').fill('Zone E2E');
    await page.getByLabel('Camp *').fill('1');
    await page.getByLabel('Téléphone / WhatsApp *').fill(telephone);
    await page.getByLabel('N° compteur *').fill(numeroCompteur);

    await page.locator('.af-btn--primary').click();
    await expect(
      page.locator('.toast--success', { hasText: 'Abonné créé avec succès' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/abonnes$/);

    // ── Retrouver l'abonné par son nom unique, ouvrir sa fiche ──────────────
    await page.locator('.fp__search input').fill(marqueur);
    const ligne = page.locator('.dt__row', { hasText: marqueur });
    await expect(ligne).toBeVisible({ timeout: 10_000 });
    await ligne.click();

    await expect(page).toHaveURL(/\/abonnes\/.+/);
    await expect(page.locator('.abonne-header-card')).toBeVisible({ timeout: 15_000 });

    // ── Résiliation ──────────────────────────────────────────────────────────
    const resilierBtn = page.locator('.abonne-action-btn--danger-outline');
    await expect(resilierBtn).toBeVisible();
    await resilierBtn.click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="resilier-sheet-title"]');
    await expect(dialog).toBeVisible();
    const confirmerBtn = dialog.locator('.dialog-btn--danger');
    // La checkbox de confirmation est obligatoire — le bouton reste désactivé sans elle.
    await expect(confirmerBtn).toBeDisabled();
    await dialog.locator('input[type="checkbox"][name="resilierConfirme"]').check();
    await expect(confirmerBtn).toBeEnabled();
    await confirmerBtn.click();

    // Toast `info` (pas `success`) — voir ABONNES.DETAIL.TOAST_RESILIE.
    await expect(
      page.locator('.toast--info', { hasText: 'Abonnement résilié' }),
    ).toBeVisible({ timeout: 10_000 });

    // Badge mis à jour, bouton de résiliation disparu (statut déjà RESILIE).
    await expect(page.locator('.abonne-badge--resilie')).toBeVisible();
    await expect(page.locator('.abonne-action-btn--danger-outline')).toHaveCount(0);
  });
});
