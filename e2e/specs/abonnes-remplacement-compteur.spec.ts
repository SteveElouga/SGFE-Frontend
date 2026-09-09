import { test, expect } from '@playwright/test';
import { genererNumeroCompteur } from '../fixtures/numero-compteur.util';

/**
 * Remplacement du compteur d'un abonné (`RemplacerCompteur`, ADMIN uniquement
 * — voir `app.routes.ts::roleGuard(['ADMIN'])` sur `/abonnes`).
 *
 * Second trou de couverture sévère signalé par l'audit « Radiographie SGFE »
 * (09/09/2026) aux côtés de la résiliation : `abonnes-gestion.spec.ts` reste
 * volontairement en LECTURE SEULE, et aucune mutation de gestion d'un abonné
 * n'était jusqu'ici rejouée contre un vrai backend.
 *
 * ── Abonné jetable, créé par le test lui-même ───────────────────────────────
 * Comme `abonnes-resiliation.spec.ts`, ce spec crée son propre abonné via le
 * formulaire réel (`/abonnes/nouveau`) plutôt que de dépendre d'un abonné ACTIF
 * du jeu de données partagé — intégralement autonome, rejouable indéfiniment.
 * `RemplacerCompteur` n'est de toute façon pas répétable sur le MÊME compteur
 * (le compteur remplacé passe au statut `REMPLACE`, définitif), donc un abonné
 * jetable par exécution est la seule option qui ne finisse pas par épuiser un
 * budget de seed comme `terrain-saisie-index.spec.ts`.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible. Ce spec se
 * neutralise avec `test.skip(...)` tant que `E2E_LIVE_BACKEND` n'est pas posée —
 * voir e2e/README.md.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Abonnés — remplacement de compteur', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin crée un abonné puis remplace son compteur", async ({ page }, testInfo) => {
    // ADMIN est un rôle back-office desktop — mêmes sélecteurs de tableau que
    // `abonnes-gestion.spec.ts` et `abonnes-resiliation.spec.ts`.
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
    const marqueur = `E2ECPT${Date.now().toString(36).toUpperCase()}`;
    const telephone = `6${String(Date.now()).slice(-8)}`;
    const ancienNumeroCompteur = genererNumeroCompteur(testInfo);

    await page.goto('/abonnes/nouveau');
    // `exact: true` : « Prénom * » se termine par « nom * » et matcherait sinon
    // aussi la recherche substring insensible à la casse de « Nom * ».
    await page.getByLabel('Nom *', { exact: true }).fill(marqueur);
    await page.getByLabel('Prénom *').fill('Playwright');
    await page.getByLabel('Quartier *').fill('Zone E2E');
    await page.getByLabel('Camp *').fill('2');
    await page.getByLabel('Téléphone / WhatsApp *').fill(telephone);
    await page.getByLabel('N° compteur *').fill(ancienNumeroCompteur);

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

    // ── Remplacement du compteur ─────────────────────────────────────────────
    const remplacerBtn = page.locator('.abonne-action-btn--ghost', { hasText: 'Remplacer compteur' });
    await expect(remplacerBtn).toBeVisible();
    await remplacerBtn.click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="remplacer-compteur-title"]');
    await expect(dialog).toBeVisible();

    // Le dernier index de l'ancien compteur se charge en asynchrone à l'ouverture
    // (`getDernierIndex`) — `save()` ignore silencieusement le clic tant qu'il
    // n'est pas résolu (voir `remplacer-compteur-sheet.component.ts::save`).
    await expect(dialog.locator('.meter-old-card__loading')).toHaveCount(0, { timeout: 10_000 });

    const nouveauNumeroCompteur = genererNumeroCompteur(testInfo);
    await dialog.locator('#newNumero').fill(nouveauNumeroCompteur);
    // Quartier/camp/date de pose sont repris automatiquement de l'ancien
    // compteur (voir `init()`) — rien d'autre à remplir pour un remplacement valide.

    const confirmerBtn = dialog.locator('.dialog-btn--primary');
    await confirmerBtn.click();

    await expect(
      page.locator('.toast--success', { hasText: 'Compteur remplacé avec succès' }),
    ).toBeVisible({ timeout: 10_000 });

    // La feuille se referme après un remplacement réussi.
    await expect(dialog).toBeHidden();
  });
});
