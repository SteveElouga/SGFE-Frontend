import { test, expect } from '@playwright/test';

/**
 * Envoi d'une facture par WhatsApp (`EnvoyerFactureWhatsapp` /
 * `RenvoyerFactureWhatsapp`, ADMIN et COMPTABLE — `/factures/:factureId`).
 * Module Facturation : ZÉRO couverture e2e propre avant ce spec (le seul
 * contact existant avec cet écran, `paiement-encaissement.spec.ts`, teste
 * l'enregistrement d'un paiement, pas un geste de Facturation elle-même).
 *
 * Retenu plutôt que `AnnulerFacture`/`RegenererFacture` : les deux autres
 * mutations disponibles sur cet écran marquent la facture `ANNULEE`
 * définitivement (voir `factures.service.ts` : « Annule une facture sans
 * l'effacer. Elle reste au journal ») — aucun moyen de revenir en arrière dans
 * le même test, contrairement à l'envoi WhatsApp qui ne touche ni au montant,
 * ni au statut, ni au solde de la facture (seul effet : une ligne `EnvoiFacture`
 * au journal + l'envoi lui-même).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  GARDE-FOU OBLIGATOIRE — WHATSAPP (même risque que `paiement-encaissement.spec.ts`)
 * ═══════════════════════════════════════════════════════════════════════════
 * `envoyerFactureWhatsapp`/`renvoyerFactureWhatsapp` envoient un message réel
 * via le MÊME `notification-service`/`whatsapp_client.py` que le reçu de
 * paiement — même garde-fou requis (`WHATSAPP_DISABLE_SEND_FOR_TESTS=1`, ou
 * `whatsapp-service` explicitement hors service pour la durée du run). Voir
 * `e2e/README.md`.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Facturation — envoi par WhatsApp', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, avec le garde-fou WhatsApp actif ' +
      '(voir le commentaire d’en-tête de ce fichier et e2e/README.md). ' +
      'Lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le comptable envoie une facture impayée par WhatsApp', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran COMPTABLE desktop — vue tableau des impayés masquée sur mobile.',
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

    // ── Une facture impayée, via l'écran Impayés (vue "Par facture") ────────
    await page.goto('/impayes');
    await page.locator('.imp-vue__opt', { hasText: 'Par facture' }).click();
    const ligne = page.locator('.dt__row').first();
    await expect(ligne).toBeVisible({ timeout: 15_000 });
    await ligne.click();

    await expect(page).toHaveURL(/\/factures\/.+/);

    // Une session WhatsApp rompue affiche un bandeau d'alerte permanent
    // (`.wa-banniere`) qui peut chevaucher les boutons d'action — le fermer
    // avant d'agir plutôt que de forcer le clic à travers lui.
    for (const fermer of await page.locator('.toast__close').all()) {
      await fermer.click().catch(() => {});
    }

    const envoyerBtn = page.locator('.detail-card__btns button.btn--dark');
    await expect(envoyerBtn).toBeVisible({ timeout: 15_000 });
    await envoyerBtn.click();

    // Même toast pour un premier envoi ou un renvoi (particularité du copy,
    // voir FACTURATION.SUCCESS_WHATSAPP — le libellé du bouton, lui, distingue
    // les deux cas, donc on ne fiabilise pas le test dessus).
    await expect(
      page.locator('.toast.toast--success .toast__title', {
        hasText: 'Facture renvoyée par WhatsApp',
      }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
