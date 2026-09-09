import { test, expect } from '@playwright/test';

/**
 * Annulation d'un paiement (`AnnulerPaiement`, ADMIN et COMPTABLE — même
 * couple de rôles que l'encaissement, voir
 * `facture-detail.component.ts::peutAnnulerPaiement`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  GARDE-FOU OBLIGATOIRE — WHATSAPP (comme `paiement-encaissement.spec.ts`,
 *     avec une deuxième source d'envoi que ce spec-ci ajoute)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce spec ENREGISTRE un paiement puis l'ANNULE dans la foulée (voir plus bas
 * pourquoi). Les DEUX étapes déclenchent chacune un envoi WhatsApp réel et
 * automatique, vérifié dans le code backend avant d'écrire quoi que ce soit
 * ici (pas supposé) :
 *
 *   - l'enregistrement : `PaiementServicer._propager_versement()` appelle
 *     `notification_client.envoyer_recu(...)` — documenté en détail dans
 *     `paiement-encaissement.spec.ts` ;
 *   - l'annulation : `PaiementServicer.AnnulerPaiement` (~L345-359,
 *     `services/paiement/paiements/grpc_server.py`) appelle
 *     `notification_client.envoyer_relance(..., etape=5)` — étape 5 = message
 *     dédié « annulation d'un versement » (`services/notification/notifications/
 *     services.py::_ETAPE_TO_TYPE`), envoyé via le MÊME `WhatsAppWebClient.send()`
 *     que le reçu.
 *
 * Les deux appels respectent le garde-fou `WHATSAPP_DISABLE_SEND_FOR_TESTS`
 * (`services/notification/notifications/whatsapp_client.py`, backend) — voir
 * `e2e/README.md` pour la procédure de vérification/activation avant de lancer
 * ce spec. **Ne jamais lancer ce spec contre une stack dont
 * `notification-service` ne porte pas ce garde-fou, ou dont le service
 * `whatsapp-service` n'est pas explicitement mis hors service pour la durée du
 * run** — sans l'un ou l'autre, DEUX messages WhatsApp réels partent vers le
 * numéro réel de l'abonné à chaque exécution.
 *
 * Vérifié côté backend (`grpc_clients.py::envoyer_recu`/`envoyer_relance`) :
 * l'échec de cet appel (service WhatsApp injoignable ou garde-fou actif) est
 * intercepté et journalisé — il ne fait JAMAIS échouer l'enregistrement ni
 * l'annulation elles-mêmes. Un environnement où `whatsapp-service` est arrêté
 * reste donc un moyen sûr de vérifier ce parcours sans risquer un envoi réel,
 * au prix de ne pas vérifier la livraison effective du message (voir le
 * rapport de session pour le détail de ce qui a et n'a pas pu être vérifié
 * bout en bout dans cet environnement précis).
 *
 * ── Pourquoi enregistrer PUIS annuler dans le même test ─────────────────────
 * `AnnulerPaiement` n'a aucune restriction de statut de facture, mais un
 * versement déjà annulé ne peut plus l'être (« Ce paiement est déjà annulé »),
 * et le jeu de données partagé ne contient pas de paiement actif « jetable » :
 * les paiements de démo alimentent `statsParMois` (dashboard), les annuler
 * fausserait durablement ces chiffres jusqu'au prochain reseed. Enregistrer un
 * paiement puis l'annuler aussitôt est donc la seule option intégralement
 * autonome et rejouable indéfiniment sans effet de bord sur les autres écrans.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que `paiement-encaissement.spec.ts` : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe("Facturation — annulation d'un paiement", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, avec le garde-fou WhatsApp actif ' +
      '(voir le commentaire d’en-tête de ce fichier et e2e/README.md). ' +
      'Lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le comptable enregistre un versement puis l’annule avec un motif', async ({
    page,
  }, testInfo) => {
    // Écran back-office desktop — même contrainte que `paiement-encaissement.spec.ts`
    // (bouton de la vue tableau masqué sous 1024px).
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran COMPTABLE desktop — bouton de la vue tableau masqué sur mobile.',
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

    // ── Enregistrement d'un versement (même parcours que paiement-encaissement.spec.ts) ──
    await page.goto('/impayes');
    await page.locator('.imp-vue__opt', { hasText: 'Par facture' }).click();
    const ajouterPaiement = page.locator('.act--primary', { hasText: '+ Paiement' }).first();
    await expect(ajouterPaiement).toBeVisible({ timeout: 15_000 });
    await ajouterPaiement.click();

    await expect(page).toHaveURL(/\/factures\/.+/);
    const form = page.locator('section.paiement-form');
    await expect(form).toBeVisible();

    const submit = form.locator('button.paiement-form__submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Fenêtre d'annulation (Gmail-style Undo) de 5s avant l'appel API effectif
    // (`UNDO_WINDOW_MS`, `paiement-form.component.ts`) — le toast de succès
    // n'arrive qu'ensuite.
    await expect(page.locator('.toast.toast--success .toast__title')).toHaveText(
      'Paiement enregistré avec succès',
      { timeout: 8_000 },
    );

    // ── Annulation du versement qui vient d'apparaître dans l'historique ────
    const ligneVersement = page.locator('.paiement-row').first();
    await expect(ligneVersement).toBeVisible({ timeout: 10_000 });

    const annulerBtn = ligneVersement.locator('.paiement-row__annuler');
    await expect(annulerBtn).toBeVisible();
    await annulerBtn.click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="annul-paiement-titre"]');
    await expect(dialog).toBeVisible();

    // Le motif est obligatoire (≥ 3 caractères) — le bouton de confirmation
    // reste désactivé sans lui.
    const confirmerBtn = dialog.locator('.ap-btn--danger');
    await expect(confirmerBtn).toBeDisabled();
    await dialog.locator('#ap-motif').fill('Annulation E2E automatisée');
    await expect(confirmerBtn).toBeEnabled();
    await confirmerBtn.click();

    await expect(
      page.locator('.toast.toast--success .toast__title', {
        hasText: 'Paiement annulé, le solde de la facture a été rétabli.',
      }),
    ).toBeVisible({ timeout: 10_000 });

    // Le versement annulé garde sa trace, marquée comme telle — jamais retiré
    // de l'historique (voir `paiements-panel.component.ts`).
    await expect(ligneVersement.locator('.paiement-badge--annule')).toBeVisible();
    await expect(ligneVersement.locator('.paiement-row__annuler')).toHaveCount(0);
  });
});
