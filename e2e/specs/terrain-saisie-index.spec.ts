import { test, expect } from '@playwright/test';

/**
 * Parcours agent terrain — saisie d'un index (écrans 07 → 08 → 09).
 *
 * Contrairement à `connexion.spec.ts`, ce parcours ne peut PAS se passer d'un
 * vrai backend : il se connecte réellement, lit une vraie tournée
 * (`campagnesService.getRelevesParAgent`) et écrit un vrai relevé (la file
 * `OfflineSaisieService` synchronise dès que `navigator.onLine`, voir
 * `core/terrain/offline-saisie.service.ts`). Il vérifie le flux « 3 tapes
 * maximum » imposé par CLAUDE.md (§ Interface Terrain) :
 *
 *   1. tap sur un abonné « à relever » dans la liste,
 *   2. saisie du nouvel index au clavier numérique,
 *   3. tap sur « Enregistrer ».
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * `.github/workflows/ci.yml` (job `e2e`) exécute `npx playwright test` sans
 * backend disponible : c'est exactement la contrainte documentée en tête de
 * `connexion.spec.ts`. Plutôt que d'inventer un mock du parcours métier réel
 * (saisie d'index, calcul de consommation, file offline), ce spec est écrit
 * pour tourner contre un backend SGFE-backend local (`docker compose`, voir
 * `e2e/README.md`), et se neutralise tout seul quand ce backend n'est pas
 * annoncé explicitement — donc y compris dans la CI actuelle, où il se
 * SKIP (vert, mais sans avoir rien vérifié) plutôt que d'échouer.
 *
 * Pour l'exécuter : voir `e2e/README.md` (variables `E2E_LIVE_BACKEND`,
 * `E2E_AGENT_USER`, `E2E_AGENT_PASSWORD`). Il suppose une campagne EN_COURS
 * avec au moins un abonné « à relever » dans la tournée de ce compte AGENT —
 * il écrit un vrai relevé dans cette campagne à chaque exécution.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Terrain — saisie d\'un index', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose, http://localhost:8080). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('l\'agent choisit un abonné, saisit un nouvel index et confirme (3 tapes)', async ({ page }) => {
    const username = process.env.E2E_AGENT_USER;
    const password = process.env.E2E_AGENT_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'E2E_AGENT_USER / E2E_AGENT_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }

    // ── Connexion réelle (pas de storageState pré-fabriqué) ──────────────────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/terrain/);

    // ── Écran 07 — liste des relevés ──────────────────────────────────────────
    // `.row--action` = les seules lignes cliquables (status A_RELEVER).
    const row = page.locator('.rows .row.row--action').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const nomAbonne = (await row.locator('.row__name').innerText()).trim();

    // Tape 1 — choisir l'abonné.
    await row.click();

    // ── Écran 08 — saisie ──────────────────────────────────────────────────
    await expect(page.locator('.t-head__sub')).toContainText(nomAbonne);

    const ancienIndexText = await page.locator('.idx-box--old .idx-box__value').innerText();
    const ancienIndex = Number.parseInt(ancienIndexText.replace(/[^\d]/g, ''), 10);
    expect(Number.isFinite(ancienIndex)).toBe(true);
    const nouvelIndex = ancienIndex + 1;

    const enregistrer = page.locator('button.btn-primary');
    await expect(enregistrer).toBeDisabled();

    // Tape 2 — clavier numérique (la seule saisie du flux, pas une "tape" au
    // sens strict, mais bien l'unique interaction restante avant validation).
    await page.locator('#idx-new').fill(String(nouvelIndex));
    await page.locator('#obs-input').fill('E2E — saisie automatisée');

    await expect(enregistrer).toBeEnabled();

    // Tape 3 — confirmer.
    await enregistrer.click();

    // ── Écran 09 — succès ──────────────────────────────────────────────────
    await expect(page.locator('.succ-head__title')).toBeVisible();
    await expect(page.locator('.succ-head__sub')).toContainText(nomAbonne);
    // Consommation = +1 m³ puisqu'on a incrémenté l'ancien index d'exactement 1.
    await expect(page.locator('.succ-row__conso')).toHaveText('1 m³');

    // Retour à la liste : l'abonné ne doit plus être « à relever ».
    await page.locator('.succ-body .btn-ghost').click();
    await expect(page.locator('.rows .row', { hasText: nomAbonne })).not.toHaveClass(/row--action/);
  });
});
