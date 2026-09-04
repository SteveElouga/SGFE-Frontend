import { test, expect } from '@playwright/test';

/**
 * Parcours comptable — enregistrement d'un versement sur une facture impayée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  GARDE-FOU OBLIGATOIRE — WHATSAPP_DISABLE_SEND_FOR_TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Historique : ce spec est resté `test.skip(true, …)` INCONDITIONNEL jusqu'à
 * ce que le backend (SGFE-backend, PR « flag de test pour désactiver l'envoi
 * WhatsApp réel ») expose un garde-fou. Raison, vérifiée dans le code du
 * backend (pas supposée) avant d'écrire quoi que ce soit ici :
 *
 * Enregistrer un paiement déclenche un envoi RÉEL et AUTOMATIQUE du reçu
 * WhatsApp, sans aucune étape intermédiaire ni opt-in :
 *
 *   SGFE-backend/services/paiement/paiements/grpc_server.py
 *     `PaiementServicer._propager_versement()` (~L179-207) appelle, sans
 *     condition, une fois par versement :
 *       self._notification_client.envoyer_recu(paiement_id=…, facture_id=…,
 *                                               abonne_id=…, montant=…, …)
 *     Cette méthode est appelée depuis LES DEUX RPC que le frontend utilise
 *     pour enregistrer un paiement :
 *       - `EnregistrerPaiement`        (~L225) — facture ciblée
 *       - `EnregistrerPaiementAbonne`  (~L469) — versement libre, imputé FIFO
 *
 *   `whatsapp-service` (Node.js + whatsapp-web.js) tourne avec une session
 *   RÉELLE et actuellement connectée — ce n'est pas un mock, pas un bac à
 *   sable : sans garde-fou, un message WhatsApp réel part vers le numéro réel
 *   de l'abonné.
 *
 * Le garde-fou : `notifications/whatsapp_client.py` (Notification Service)
 * lit désormais `WHATSAPP_DISABLE_SEND_FOR_TESTS` (`"1"`/`"true"`). Activée
 * sur le service `notification-service` de la stack backend, `send()` et
 * `send_with_pdf()` ne contactent plus jamais `whatsapp-service` — succès
 * simulé, log explicite côté backend. Voir le backend :
 * `services/notification/notifications/whatsapp_client.py` (docstring du
 * module) pour les deux façons de l'activer sur une stack de test locale.
 *
 * ⚠️  CE SPEC NE DOIT JAMAIS S'EXÉCUTER CONTRE UNE STACK BACKEND SANS CETTE
 * VARIABLE POSÉE SUR `notification-service`. Le gate `E2E_LIVE_BACKEND` ne
 * protège PAS de ça — il protège seulement de l'exécuter sans backend du
 * tout. C'est à la personne qui lance ce spec de s'assurer que la stack
 * backend a bien été démarrée avec `WHATSAPP_DISABLE_SEND_FOR_TESTS=1` sur
 * `notification-service` — voir e2e/README.md, section dédiée à ce spec, et
 * les avertissements ci-dessus avant de le lancer.
 *
 * Le bouton « Envoyer le reçu » du frontend (mutation ENVOYER_RECU_PAIEMENT,
 * `facture-detail.component.ts::envoyerRecuPourPaiement`, PR #159) N'EST PAS
 * l'action qui déclenche l'envoi automatique — c'est un RENVOI manuel
 * distinct. Ce spec ne l'appelle jamais.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe("Facturation — enregistrement d'un paiement", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, démarré avec WHATSAPP_DISABLE_SEND_FOR_TESTS=1 ' +
      "sur notification-service (sinon : envoi WhatsApp RÉEL, voir le commentaire d'en-tête de " +
      'ce fichier). Lancer avec E2E_LIVE_BACKEND=1 — voir e2e/README.md.',
  );

  test('le comptable ouvre une facture impayée et enregistre un versement', async ({ page }) => {
    const username = process.env.E2E_COMPTABLE_USER;
    const password = process.env.E2E_COMPTABLE_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'E2E_COMPTABLE_USER / E2E_COMPTABLE_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }

    // ── Connexion réelle ─────────────────────────────────────────────────────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // ── Une facture avec un solde restant, via l'écran Impayés ────────────────
    await page.goto('/impayes');
    await page.locator('.imp-vue__opt', { hasText: 'Par facture' }).click();
    const ajouterPaiement = page.locator('.act--primary', { hasText: '+ Paiement' }).first();
    await expect(ajouterPaiement).toBeVisible({ timeout: 15_000 });
    await ajouterPaiement.click();

    // `ajouterPaiement()` navigue vers /factures/:factureId?paiement=1, qui
    // ouvre automatiquement le panneau (voir `autoOpenPaiement` dans
    // facture-detail.component.ts).
    await expect(page).toHaveURL(/\/factures\/.+/);
    const form = page.locator('section.paiement-form');
    await expect(form).toBeVisible();

    // Le formulaire est pré-rempli avec le solde restant et le mode ESPECES
    // (pas de référence de transaction requise) — voir le constructeur de
    // `PaiementFormComponent`. On ne touche à rien d'autre.
    const submit = form.locator('button.paiement-form__submit');
    await expect(submit).toBeEnabled();

    // ⚠️ Cette ligne enregistre le paiement ET déclenche l'envoi automatique
    // du reçu — simulé si (et SEULEMENT si) WHATSAPP_DISABLE_SEND_FOR_TESTS
    // est posée côté backend. Voir l'avertissement en tête de fichier.
    await submit.click();

    // `submit()` ouvre une fenêtre d'annulation (Gmail-style Undo) de 5s avant
    // l'appel API effectif — voir `UNDO_WINDOW_MS` dans
    // `paiement-form.component.ts`. Le toast de succès n'arrive qu'ensuite.
    await expect(page.locator('.toast.toast--success .toast__title')).toHaveText(
      'Paiement enregistré avec succès',
      { timeout: 8_000 },
    );
  });
});
