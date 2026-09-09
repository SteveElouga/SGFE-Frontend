import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Correction d'un relevé déjà saisi (`CorrigerReleve`, ADMIN et SUPERVISEUR —
 * voir `campagne-detail.component.ts::canActOnCampagne`). Module Campagnes :
 * ZÉRO couverture e2e avant ce spec (`e2e/README.md` le liste explicitement
 * dans « Pas encore couvert » : « Les campagnes (création, clôture,
 * affectation d'agents/zones) »).
 *
 * `CorrigerReleve` est le geste cité en exemple par l'audit « Radiographie
 * SGFE » (09/09/2026) parmi ceux « jamais rejoués contre un vrai backend » —
 * corriger une erreur de saisie d'index une fois la campagne avancée (voire
 * clôturée : le bouton reste affiché même après clôture, voir le commentaire
 * du commit `18d18a4`).
 *
 * ── Fixtures créées par API, action vérifiée par UI ─────────────────────────
 * Le jeu de données actuel de la stack ne contient QUE des campagnes CLOTUREE
 * sans aucun relevé au statut RELEVE (précondition de `CorrigerReleve`) — et
 * `terrain-saisie-index.spec.ts` a de toute façon un budget de seed déjà
 * compté pour ses propres exécutions (voir son commentaire d'en-tête). Plutôt
 * que de dépendre d'un état partagé fragile, ce spec construit sa propre
 * fixture via l'API GraphQL (`request` de Playwright, mêmes mutations que le
 * frontend : `CreerCampagne(demarrerMaintenant: true)` → `AjouterAbonnesCampagne`
 * → `SaisirIndex`) puis n'exerce l'UI que pour le geste réellement testé : la
 * correction elle-même. Entièrement autonome, rejouable indéfiniment.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que les autres specs « backend réel » : `.github/workflows/ci.yml`
 * (job `e2e`) exécute `npx playwright test` sans backend disponible. Ce spec se
 * neutralise avec `test.skip(...)` tant que `E2E_LIVE_BACKEND` n'est pas posée —
 * voir e2e/README.md.
 */
const LIVE_BACKEND = process.env.E2E_LIVE_BACKEND === '1';

async function gql<T = Record<string, unknown>>(
  request: APIRequestContext,
  token: string | null,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await request.post('/graphql', {
    data: { query, variables },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await response.json();
  if (body.errors) {
    throw new Error(`Erreur GraphQL : ${JSON.stringify(body.errors)}`);
  }
  return body.data as T;
}

test.describe('Campagnes — correction d\'un relevé', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel (docker compose). ' +
      'Voir e2e/README.md — lancer avec E2E_LIVE_BACKEND=1.',
  );

  test("l'admin corrige un index déjà saisi dans une campagne en cours", async ({
    page,
    request,
  }, testInfo) => {
    // ADMIN/SUPERVISEUR sont des rôles back-office desktop — `.releves-table`
    // (vue tableau) est masquée sous 1024px au profit de `.rm-card` (même
    // mécanisme que `abonnes-gestion.spec.ts`).
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran back-office desktop — vue tableau masquée sur mobile.',
    );

    const username = process.env.E2E_ADMIN_USER;
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'E2E_ADMIN_USER / E2E_ADMIN_PASSWORD requis pour ce spec — voir e2e/README.md.',
      );
    }

    // ── Fixture : campagne + abonné + relevé déjà saisi, via l'API ──────────
    const marqueur = `E2ECOR${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();

    const { login } = await gql<{ login: { accessToken: string } }>(
      request,
      null,
      'mutation($i: String!, $p: String!) { login(identifier: $i, password: $p) { accessToken } }',
      { i: username, p: password },
    );
    const token = login.accessToken;

    const { createAbonne } = await gql<{ createAbonne: { id: string } }>(
      request,
      token,
      `mutation($input: CreateAbonneInput!) { createAbonne(input: $input) { id } }`,
      {
        input: {
          nom: marqueur,
          prenom: 'Playwright',
          telephoneWhatsapp: `+2376${String(Date.now()).slice(-8)}`,
          numeroCompteur: Number(String(Date.now()).slice(-6)),
          quartier: 'Zone E2E',
          camp: 3,
          indexInitial: 0,
          datePose: now.toISOString().slice(0, 10),
        },
      },
    );
    const abonneId = createAbonne.id;

    const { creerCampagne } = await gql<{ creerCampagne: { campagneId: string } }>(
      request,
      token,
      `mutation($input: CreateCampagneInput!) { creerCampagne(input: $input) { campagneId } }`,
      {
        input: {
          nom: `Campagne ${marqueur}`,
          periodeMois: now.getMonth() + 1,
          periodeAnnee: now.getFullYear(),
          demarrerMaintenant: true,
          envoyerWhatsappAuto: false,
          genererFacturesAuto: false,
        },
      },
    );
    const campagneId = creerCampagne.campagneId;

    await gql(
      request,
      token,
      `mutation($campagneId: String!, $abonneIds: [String!]!) { ajouterAbonnesCampagne(campagneId: $campagneId, abonneIds: $abonneIds) { nbAjoutes } }`,
      { campagneId, abonneIds: [abonneId] },
    );

    const ancienIndex = 0;
    const premierIndex = 10;
    await gql(
      request,
      token,
      `mutation($input: SaisirIndexInput!) { saisirIndex(input: $input) { releveId statut } }`,
      { input: { campagneId, abonneId, nouveauIndex: premierIndex, observation: 'E2E — saisie initiale' } },
    );

    // ── Vérification par l'UI : correction du relevé fraîchement saisi ──────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`/campagnes/${campagneId}`);
    const ligne = page.locator('table.releves-table tbody tr').first();
    await expect(ligne).toBeVisible({ timeout: 15_000 });
    await expect(ligne).toContainText(marqueur, { ignoreCase: true });

    const corrigerBtn = ligne.locator('.releves-table__corriger-btn');
    await expect(corrigerBtn).toBeVisible();
    await corrigerBtn.click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="corriger-releve-title"]');
    await expect(dialog).toBeVisible();

    const nouvelIndexCorrige = premierIndex + 2;
    const champIndex = dialog.locator('#crNouvelIndex');
    await champIndex.fill(String(nouvelIndexCorrige));
    await dialog.locator('#crObservation').fill('E2E — correction automatisée');

    await dialog.locator('.dialog-btn--primary').click();

    await expect(
      page.locator('.toast--success', { hasText: 'Index corrigé' }),
    ).toBeVisible({ timeout: 10_000 });

    // La ligne reflète le nouvel index sans rechargement complet de la page
    // (`campagne-detail.component.ts::onReleveCorrige` met à jour en place).
    await expect(ligne).toContainText(String(nouvelIndexCorrige));
    // Consommation recalculée : nouvelIndexCorrige - ancienIndex.
    await expect(ligne).toContainText(String(nouvelIndexCorrige - ancienIndex));
  });
});
