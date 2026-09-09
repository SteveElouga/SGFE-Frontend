import { test, expect } from '@playwright/test';

/**
 * Diffusion WhatsApp de masse (`CreerDiffusion`, ADMIN uniquement — voir
 * `app.routes.ts::roleGuard(['ADMIN'])` sur `/communication`). Module
 * Communication : ZÉRO couverture e2e avant ce spec.
 *
 * C'est l'un des gestes cités nommément par l'audit « Radiographie SGFE »
 * (09/09/2026) parmi ceux jamais rejoués contre un vrai backend (« envoyer une
 * diffusion WhatsApp »).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  LIMITE DE VÉRIFICATION — LIVRAISON RÉELLE NON GARANTIE PAR CE SPEC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `creerDiffusion` ne fait que créer la diffusion et ses lignes ; l'envoi
 * effectif est fait en fond par `diffusion_processor_job` (APScheduler, 15s,
 * `services/notification/notifications/schedulers.py`), qui appelle
 * `WhatsAppWebClient.send()` pour chaque abonné ciblé — **le même client, avec
 * le même garde-fou `WHATSAPP_DISABLE_SEND_FOR_TESTS`, que celui documenté en
 * détail dans `paiement-encaissement.spec.ts`** (vérifié directement dans
 * `services/notification/notifications/services.py::DiffusionService.
 * traiter_lot_en_attente`, pas supposé).
 *
 * Ce spec cible un abonné du jeu de données existant (numéro de téléphone
 * réel) — sans garde-fou actif côté `notification-service` (variable
 * d'environnement) OU sans `whatsapp-service` explicitement mis hors service
 * pour la durée du run, il déclenchera un VRAI message WhatsApp. Voir
 * `e2e/README.md` pour la procédure de vérification avant de lancer ce spec.
 *
 * Dégradation vérifiée dans le code backend : `traiter_lot_en_attente` capture
 * `WhatsAppDeliveryError` PAR LIGNE (une ligne en échec n'empêche pas les
 * autres, et n'empêche jamais la diffusion de se refermer via
 * `terminer_si_completes()`), donc un environnement où `whatsapp-service` est
 * arrêté est un moyen sûr de vérifier tout le mécanisme UI/GraphQL (création,
 * navigation, progression, clôture) SANS jamais risquer un envoi réel — au
 * prix de ne jamais observer `nbEnvoyes > 0` dans ces conditions. C'est
 * exactement la limite annoncée dans le rapport de session : ce spec vérifie
 * le mécanisme, pas la livraison réelle sur un téléphone (qui dépendrait d'une
 * session WhatsApp Web réellement liée, hors de portée de cet environnement).
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Communication — diffusion WhatsApp', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, avec le garde-fou WhatsApp actif ' +
      '(voir le commentaire d’en-tête de ce fichier et e2e/README.md). ' +
      'Lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin lance une diffusion à un abonné et suit sa progression jusqu'à son terme", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    // ADMIN est un rôle back-office desktop — table de sélection des abonnés
    // masquée sous 1024px (même mécanisme que les autres écrans back-office).
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran ADMIN desktop — table de sélection masquée sur mobile.',
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

    // ── Création de la diffusion ─────────────────────────────────────────────
    await page.goto('/communication/nouvelle');

    const message = `Message e2e automatisé — ${Date.now()}`;
    await page.locator('#dfcMessage').fill(message);

    // Un seul destinataire suffit à vérifier le mécanisme — la première ligne
    // de la table (peu importe l'abonné, aucune donnée d'abonné n'est modifiée
    // par une diffusion).
    const premiereCase = page.locator('td.dt__select-col input[type=checkbox]').first();
    await expect(premiereCase).toBeVisible({ timeout: 15_000 });
    await premiereCase.check();

    const envoyerBtn = page.locator('button.dfc-footer__envoyer');
    await expect(envoyerBtn).toBeEnabled();
    await envoyerBtn.click();

    await expect(
      page.locator('.toast.toast--success .toast__title', { hasText: 'Diffusion lancée' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/communication\/.+/);

    // ── Suivi de la progression jusqu'à clôture ──────────────────────────────
    // `diffusion_processor_job` tourne toutes les 15s côté backend — laisser
    // plusieurs cycles pour que la diffusion (une seule ligne) se referme.
    await expect(page.locator('.dd-badge--termine')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.dd-progress__stats')).toContainText('/ 1 envoyés');
  });
});
