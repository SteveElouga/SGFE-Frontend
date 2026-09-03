import { test, expect } from '@playwright/test';

/**
 * Parcours comptable — enregistrement d'un versement sur une facture impayée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  CE SPEC NE S'EXÉCUTE JAMAIS (test.skip(true, …) ci-dessous).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pas seulement gated derrière `E2E_LIVE_BACKEND` comme
 * `terrain-saisie-index.spec.ts` — le skip est INCONDITIONNEL, y compris en
 * local avec un backend vivant. Raison, vérifiée dans le code du backend
 * (pas supposée) avant d'écrire quoi que ce soit ici :
 *
 * Enregistrer un paiement déclenche un envoi RÉEL et AUTOMATIQUE du reçu
 * WhatsApp, sans aucune étape intermédiaire ni opt-in :
 *
 *   SGFE-backend/services/paiement/paiements/grpc_server.py
 *     `PaiementServicer._propager_versement()` (~L179-203) appelle, sans
 *     condition, une fois par versement :
 *       self._notification_client.envoyer_recu(paiement_id=…, facture_id=…,
 *                                               abonne_id=…, montant=…, …)
 *     Cette méthode est appelée depuis LES DEUX RPC que le frontend utilise
 *     pour enregistrer un paiement :
 *       - `EnregistrerPaiement`        (~L225) — facture ciblée
 *       - `EnregistrerPaiementAbonne`  (~L469) — versement libre, imputé FIFO
 *     Aucun flag, aucune configuration, aucun mode "test" ne permet de
 *     désactiver cet envoi depuis l'API ou l'UI.
 *
 *   `whatsapp-service` (Node.js + whatsapp-web.js) tourne avec une session
 *   RÉELLE et actuellement connectée — ce n'est pas un mock, pas un bac à
 *   sable : un message WhatsApp réel part vers le numéro réel de l'abonné.
 *
 * Le bouton « Envoyer le reçu » du frontend (mutation ENVOYER_RECU_PAIEMENT,
 * `facture-detail.component.ts::envoyerRecuPourPaiement`, PR #159) N'EST PAS
 * l'action qui déclenche cet envoi — c'est un RENVOI manuel distinct, prévu
 * pour un reçu émis avant que le journal WhatsApp ne garde le lien vers son
 * versement (voir le commentaire de `ENVOYER_RECU_PAIEMENT` dans
 * `graphql/mutations/factures.mutations.ts`). Ne jamais l'appeler dans ce
 * spec ne suffit donc PAS à éviter l'envoi : l'envoi automatique a déjà eu
 * lieu dès la ligne `submit.click()` ci-dessous, avant tout bouton "reçu".
 *
 * Ce spec reste écrit — parcours page-objects complet, prêt à l'emploi — pour
 * documenter le flux et servir de base le jour où un garde-fou existe
 * (compte WhatsApp de bac à sable dédié, flag serveur pour désactiver l'envoi
 * en environnement de test, ou mock du service de notification). Tant que ce
 * garde-fou n'existe pas : NE PAS retirer le `test.skip(true, …)` ci-dessous,
 * quel que soit l'environnement (local, CI, ou autre).
 */
test.describe('Facturation — enregistrement d\'un paiement', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    true,
    "Volontairement jamais exécuté : enregistrer un paiement déclenche un envoi WhatsApp RÉEL " +
      "et automatique du reçu (backend : _propager_versement → envoyer_recu, appelé sans condition " +
      "depuis EnregistrerPaiement ET EnregistrerPaiementAbonne). Voir le commentaire d'en-tête de ce " +
      "fichier et e2e/README.md avant d'envisager de retirer ce skip.",
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

    // ⚠️ Point de non-retour si ce spec s'exécutait un jour : cette ligne
    // enregistre le paiement ET déclenche l'envoi automatique du reçu
    // WhatsApp réel (voir l'avertissement en tête de fichier). C'est
    // exactement pour ça que le test.skip(true, …) ci-dessus doit rester.
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
