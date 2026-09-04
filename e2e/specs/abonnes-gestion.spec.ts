import { test, expect } from '@playwright/test';

/**
 * Gestion des abonnés — liste, recherche et fiche détail (`/abonnes`, ADMIN
 * uniquement — voir `app.routes.ts::roleGuard(['ADMIN'])`).
 *
 * Comme `terrain-saisie-index.spec.ts`, ce parcours ne peut PAS se passer d'un
 * vrai backend : `AbonnesListComponent` charge le parc réel via GraphQL
 * (`abonnes`, voir les queries dans `graphql/queries/abonnes.queries.ts`), et
 * `AbonneDetailComponent` résout la fiche complète (compteur, factures,
 * arriéré) pour un abonné réel. Mocker cette liste reviendrait à retester le
 * gabarit contre des données inventées, pas la fonctionnalité de gestion.
 *
 * ── Ce qui est vérifié ──────────────────────────────────────────────────────
 * Le point d'entrée de TOUTE la gestion d'un abonné — liste → recherche →
 * ouverture de la fiche — n'avait jusqu'ici aucune couverture e2e, alors que
 * c'est l'écran depuis lequel un ADMIN suspend, réactive, résilie ou modifie
 * un abonné. Ce spec reste volontairement en LECTURE SEULE (aucune mutation) :
 * il vérifie que la recherche filtre bien la liste et que la fiche ouverte
 * correspond à la ligne cliquée, sans modifier la moindre donnée du parc —
 * contrairement à `terrain-saisie-index.spec.ts`, il est donc rejouable sans
 * laisser de trace.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que `terrain-saisie-index.spec.ts` : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible. Ce spec
 * se neutralise avec `test.skip(...)` tant que `E2E_LIVE_BACKEND` n'est pas
 * posée — voir e2e/README.md.
 *
 * Prérequis : un compte ADMIN dont le parc contient au moins un abonné dont
 * le numéro ou le nom est connu à l'avance (`E2E_ABONNE_RECHERCHE`) — utilisé
 * comme terme de recherche pour vérifier que le filtrage fonctionne vraiment,
 * plutôt que de cliquer la première ligne d'une liste non filtrée (ce qui ne
 * prouverait rien sur la recherche elle-même).
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

test.describe('Abonnés — liste, recherche et fiche détail', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin recherche un abonné et ouvre sa fiche", async ({ page }) => {
    const username = process.env.E2E_ADMIN_USER;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const recherche = process.env.E2E_ABONNE_RECHERCHE;
    if (!username || !password) {
      throw new Error(
        'E2E_ADMIN_USER / E2E_ADMIN_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }
    if (!recherche) {
      throw new Error(
        "E2E_ABONNE_RECHERCHE requis (numéro ou nom d'un abonné existant) — voir e2e/README.md.",
      );
    }

    // ── Connexion réelle ─────────────────────────────────────────────────────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // ── Liste des abonnés ──────────────────────────────────────────────────
    await page.goto('/abonnes');
    const table = page.locator('app-data-table');
    await expect(table).toBeVisible({ timeout: 15_000 });

    // ── Recherche : la liste doit se réduire à des lignes qui matchent ──────
    await page.locator('.fp__search input').fill(recherche);
    // Debounce de 250ms côté `app-filters-panel` (voir `[debounceMs]="250"`
    // dans abonnes-list.component.html) — laisser le temps au filtrage réel
    // de s'appliquer avant d'observer les lignes.
    const rows = page.locator('.dt__row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(recherche, { ignoreCase: true });
    }

    // ── Ouverture de la fiche depuis la ligne trouvée ───────────────────────
    const premiereLigne = rows.first();
    const numeroAffiche = (
      await premiereLigne.locator('.abonnes-table__numero').innerText()
    ).trim();
    await premiereLigne.click();

    await expect(page).toHaveURL(/\/abonnes\/.+/);
    await expect(page.locator('.abonne-header-card')).toBeVisible({ timeout: 15_000 });
    // La fiche ouverte doit correspondre à la ligne cliquée, pas à une autre —
    // seule garantie qu'une navigation en table n'a pas ouvert la mauvaise fiche.
    // `localisationLine()` place `numeroAbonne` en tête (voir abonne-detail.component.ts).
    await expect(page.locator('.abonne-header-card__sub')).toContainText(numeroAffiche || '');

    // ── Retour à la liste via le lien retour du topbar ──────────────────────
    await page.locator('.page-topbar__back').click();
    await expect(page).toHaveURL(/\/abonnes$/);
  });
});
