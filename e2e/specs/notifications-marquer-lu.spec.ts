import { test, expect } from '@playwright/test';

/**
 * Centre de notifications (`/notifications`, tout rôle authentifié, mais
 * `peutCharger()` restreint le contenu à ADMIN/COMPTABLE — voir
 * `notifications.service.ts`). Module Notifications : ZÉRO couverture e2e
 * avant ce spec.
 *
 * ⚠️ Particularité vérifiée avant d'écrire ce spec : il n'existe AUCUNE
 * mutation GraphQL pour ce module. Le schéma n'expose aucune query
 * `notification*` — les notifications sont **dérivées** de trois lectures
 * réelles (`envois` en échec, `impayes` au solde restant positif, `paiements`
 * récents non annulés, voir la docstring de `NotificationsService`), et l'état
 * « lu » n'a **aucun backend où vivre** : il ne vit que dans le `localStorage`
 * du poste (clé `sgfe:notifications:lues`), assumé comme « commodité locale,
 * pas une donnée métier » par le composant lui-même.
 *
 * Ce spec est donc un test hybride, à la différence des autres ajoutés dans
 * cette itération : LECTURE réelle contre le backend (le contenu affiché doit
 * provenir de vraies factures impayées), ÉCRITURE 100% côté navigateur pour le
 * « marquer comme lu » — aucun risque d'effet de bord serveur, mais aussi
 * aucune preuve que cet état survivrait à un autre poste ou à un autre
 * navigateur (ce n'est pas son rôle).
 *
 * Précondition : le compte utilisé doit avoir au moins une facture impayée
 * dans son portefeuille (déjà garanti pour `E2E_COMPTABLE_USER`, utilisé par
 * `paiement-encaissement.spec.ts`) — cela suffit à produire au moins une
 * notification « impayé » non lue, sans dépendre d'un échec WhatsApp ou d'un
 * paiement récent.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Notifications — tout marquer comme lu', () => {
  // `storageState` vide garantit un `localStorage` propre : sans ça, un run
  // précédent pourrait avoir déjà marqué ces mêmes notifications comme lues
  // (clé `sgfe:notifications:lues` persistée par origine), et `.mark-all`
  // n'existerait alors plus (`unreadCount() === 0`).
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le comptable marque toutes ses notifications comme lues, et ça survit à un rechargement', async ({
    page,
  }) => {
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

    await page.goto('/notifications');

    const markAllBtn = page.locator('.mark-all');
    await expect(markAllBtn).toBeVisible({ timeout: 15_000 });
    const nonLues = page.locator('.notif-item--unread');
    await expect(nonLues.first()).toBeVisible();

    await markAllBtn.click();

    // Aucun toast n'est déclenché par ce geste (contrairement aux autres
    // mutations de cette session) — la preuve passe par l'état de la page.
    await expect(page.locator('.notif-item--unread')).toHaveCount(0);
    await expect(page.locator('.mark-all')).toHaveCount(0);

    // ── Persistance réelle : `localStorage`, donc doit survivre au reload ──
    await page.reload();
    await expect(page.locator('.notif-item--unread')).toHaveCount(0);
    await expect(page.locator('.mark-all')).toHaveCount(0);
  });
});
