import { test, expect } from '@playwright/test';

/**
 * Création d'un utilisateur (`CreateUser`, ADMIN uniquement — `/utilisateurs`).
 * Module Utilisateurs : ZÉRO couverture e2e avant ce spec.
 *
 * ⚠️ Créer un utilisateur déclenche l'envoi d'un VRAI code d'activation —
 * WhatsApp pour AGENT/COMPTABLE/SUPERVISEUR, lien e-mail Brevo pour ADMIN
 * (voir `utilisateur-edit.component.html` : « Déterminé par le rôle — l'ADMIN
 * s'active par lien e-mail Brevo »). Ce spec crée volontairement un compte
 * **AGENT** (jamais ADMIN) pour rester protégé par le même garde-fou WhatsApp
 * que les autres specs « backend réel » de cette session (`whatsapp-service`
 * arrêté / `WHATSAPP_DISABLE_SEND_FOR_TESTS=1` — voir e2e/README.md) : un
 * compte ADMIN partirait par e-mail Brevo, un canal externe que ce garde-fou
 * ne couvre pas.
 *
 * Il n'existe aucune mutation de suppression dure (`DeactivateUser` est une
 * désactivation « douce », réversible via `ReactivateUser`) — ce spec
 * désactive donc le compte qu'il vient de créer avant de terminer, pour ne
 * jamais laisser de compte actif orphelin. Numéro de téléphone et nom
 * d'utilisateur uniques par exécution (horodatage) : intégralement autonome,
 * rejouable indéfiniment.
 *
 * ⚠️ Vérifié en conditions réelles (session de rédaction de ce spec) :
 * contrairement à `EnvoyerFacture`/`EnregistrerPaiement`/`CreerDiffusion`,
 * `CreateUser` (`services/auth/comptes/services.py::UserAdminService.
 * create_user`) NE dégrade PAS gracieusement un échec d'envoi WhatsApp — le
 * compte est bien créé (la transaction DB commit AVANT l'appel à
 * `phone_otp.send_otp()`), mais `send_otp()` appelle `whatsapp_client.send()`
 * SANS try/except, donc une session WhatsApp indisponible fait échouer tout
 * le RPC `CreateUser` alors que l'utilisateur existe déjà en base (`isActive:
 * false`, orphelin, rejouable seulement via `resend_credentials`, jamais
 * revu par ce spec). Le docstring du service affirme le contraire (« un échec
 * d'envoi ne doit pas faire disparaître le compte déjà créé ») — c'est vrai
 * pour la disparition, pas pour l'erreur renvoyée à l'appelant : un ADMIN qui
 * réessaie après ce message d'erreur retombera sur une collision de nom
 * d'utilisateur. Signalé pour le dépôt SGFE-backend, non corrigé ici (hors
 * périmètre de ce dépôt et de cette itération).
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Utilisateurs — création puis désactivation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, avec le garde-fou WhatsApp actif ' +
      '(voir le commentaire d’en-tête de ce fichier et e2e/README.md). ' +
      'Lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin crée un compte agent puis le désactive", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran ADMIN desktop — cohérent avec les autres specs back-office.',
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

    // ── Création ─────────────────────────────────────────────────────────────
    const nouveauUsername = `e2e_agent_${Date.now().toString(36)}`;
    const nouveauTelephone = `6${String(Date.now()).slice(-8)}`;

    await page.goto('/utilisateurs/nouveau');
    await page.locator('#username').fill(nouveauUsername);
    await page.locator('#phoneNumber').fill(nouveauTelephone);

    await page.locator('#role').click();
    await page.getByRole('option', { name: 'Agent terrain' }).click();

    const submitBtn = page.locator('.user-form__submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Compte créé' }),
    ).toBeVisible({ timeout: 10_000 });
    // Redirection différée (1500ms, voir utilisateur-form.component.ts) vers la liste.
    await expect(page).toHaveURL(/\/utilisateurs$/, { timeout: 10_000 });

    // ── Désactivation immédiate (nettoyage) ─────────────────────────────────
    const ligne = page.locator('.dt__row', { hasText: nouveauUsername });
    await expect(ligne).toBeVisible({ timeout: 10_000 });

    const desactiverBtn = ligne.locator('.users-table__action-btn--danger');
    await desactiverBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Désactiver' }).click();

    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Compte désactivé' }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
