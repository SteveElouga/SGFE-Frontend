import { test, expect, type APIRequestContext } from '@playwright/test';
import { genererNumeroCompteur } from '../fixtures/numero-compteur.util';

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
 * ── Fixture dédiée, corrigé le 10/09/2026 (course avec `paiements-
 *    annulation.spec.ts`) ────────────────────────────────────────────────
 * Ce spec ciblait auparavant la PREMIÈRE ligne de `/impayes` (vue « Par
 * facture ») — une liste partagée et vivante. Collision reproduite en
 * conditions réelles avec `paiements-annulation.spec.ts`, qui ciblait la
 * même première ligne (voir `e2e/README.md`, section « Specs ajoutées le
 * 09/09/2026 ») : les deux specs pouvaient agir sur LA MÊME facture au même
 * instant en exécution parallèle.
 *
 * Comme `campagnes-correction-releve.spec.ts`, ce spec construit désormais sa
 * propre fixture par API GraphQL (`request` de Playwright, compte ADMIN :
 * `createAbonne` → `creerCampagne(demarrerMaintenant: true)` →
 * `ajouterAbonnesCampagne` → `saisirIndex` → `genererFactures`) plutôt que de
 * dépendre d'une facture impayée préexistante du jeu de données partagé.
 * `genererFactures` n'exige pas que la campagne soit clôturée (vérifié dans
 * `services/facturation/factures/grpc_server.py::GenererFactures`, qui lit
 * simplement tous les relevés de la campagne, quel que soit son statut) —
 * une campagne `EN_COURS` suffit, comme pour `campagnes-correction-releve`.
 *
 * Bénéfice secondaire : l'abonné de fixture porte un numéro WhatsApp
 * FABRIQUÉ (`+2376<horodatage>`, jamais un numéro réel), alors que la facture
 * partagée piochée auparavant appartenait à un abonné réel du jeu de
 * données — l'envoi déclenché par ce spec ne risque donc plus de joindre un
 * numéro réel même si le garde-fou applicatif venait à manquer.
 *
 * Nécessite donc désormais `E2E_ADMIN_USER`/`E2E_ADMIN_PASSWORD` EN PLUS de
 * `E2E_COMPTABLE_USER`/`E2E_COMPTABLE_PASSWORD` (déjà exportées ensemble dans
 * la commande documentée par `e2e/README.md` pour ce groupe de onze specs) :
 * l'ADMIN construit la fixture (`createAbonne` est ADMIN uniquement,
 * `creerCampagne`/`ajouterAbonnesCampagne` ADMIN ou SUPERVISEUR, `saisirIndex`
 * ADMIN/AGENT/SUPERVISEUR — voir `gateway/schema/abonne_mutations.py` et
 * `campagne_mutations.py`) ; le COMPTABLE reste celui qui effectue le geste
 * UI réellement testé (l'envoi WhatsApp d'une facture).
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

test.describe('Facturation — envoi par WhatsApp', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !LIVE_BACKEND,
    'Nécessite le backend SGFE-backend réel, avec le garde-fou WhatsApp actif ' +
      '(voir le commentaire d’en-tête de ce fichier et e2e/README.md). ' +
      'Lancer avec E2E_LIVE_BACKEND=1.',
  );

  test('le comptable envoie une facture impayée par WhatsApp', async ({ page, request }, testInfo) => {
    // La fixture dédiée ajoute 5 appels API séquentiels (login ADMIN +
    // createAbonne + creerCampagne + ajouterAbonnesCampagne + saisirIndex +
    // genererFactures) avant même le scénario UI — le timeout par défaut de
    // Playwright (30s) laisse trop peu de marge une fois ce coût ajouté.
    test.setTimeout(60_000);

    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran COMPTABLE desktop — vue tableau des impayés masquée sur mobile.',
    );

    const adminUsername = process.env.E2E_ADMIN_USER;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;
    const username = process.env.E2E_COMPTABLE_USER;
    const password = process.env.E2E_COMPTABLE_PASSWORD;
    if (!adminUsername || !adminPassword || !username || !password) {
      throw new Error(
        'E2E_ADMIN_USER / E2E_ADMIN_PASSWORD / E2E_COMPTABLE_USER / E2E_COMPTABLE_PASSWORD ' +
          'requis pour ce spec — voir e2e/README.md (ADMIN construit la fixture, ' +
          'COMPTABLE effectue le geste testé).',
      );
    }

    // ── Fixture : abonné + campagne + relevé + facture dédiés, via l'API ────
    const marqueur = `E2EWA${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();

    const { login } = await gql<{ login: { accessToken: string } }>(
      request,
      null,
      'mutation($i: String!, $p: String!) { login(identifier: $i, password: $p) { accessToken } }',
      { i: adminUsername, p: adminPassword },
    );
    const adminToken = login.accessToken;

    const { createAbonne } = await gql<{ createAbonne: { id: string } }>(
      request,
      adminToken,
      `mutation($input: CreateAbonneInput!) { createAbonne(input: $input) { id } }`,
      {
        input: {
          nom: marqueur,
          prenom: 'Playwright',
          telephoneWhatsapp: `+2376${String(Date.now()).slice(-8)}`,
          numeroCompteur: Number(genererNumeroCompteur(testInfo)),
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
      adminToken,
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
      adminToken,
      `mutation($campagneId: String!, $abonneIds: [String!]!) { ajouterAbonnesCampagne(campagneId: $campagneId, abonneIds: $abonneIds) { nbAjoutes } }`,
      { campagneId, abonneIds: [abonneId] },
    );

    await gql(
      request,
      adminToken,
      `mutation($input: SaisirIndexInput!) { saisirIndex(input: $input) { releveId statut } }`,
      { input: { campagneId, abonneId, nouveauIndex: 10, observation: 'E2E — saisie initiale' } },
    );

    const { genererFactures } = await gql<{
      genererFactures: Array<{ factureId: string }>;
    }>(
      request,
      adminToken,
      `mutation($campagneId: String!, $envoyerWhatsappAuto: Boolean!) { genererFactures(campagneId: $campagneId, envoyerWhatsappAuto: $envoyerWhatsappAuto) { factureId } }`,
      { campagneId, envoyerWhatsappAuto: false },
    );
    const factureId = genererFactures[0]?.factureId;
    if (!factureId) {
      throw new Error('Aucune facture générée pour la campagne de fixture — relevé non pris en compte ?');
    }

    // ── Vérification par l'UI, sur cette facture dédiée ─────────────────────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`/factures/${factureId}`);
    await expect(page).toHaveURL(/\/factures\/.+/);

    // Une session WhatsApp rompue affiche un bandeau d'alerte permanent
    // (`.wa-banniere`) qui peut chevaucher les boutons d'action — le fermer
    // avant d'agir plutôt que de forcer le clic à travers lui. En exécution
    // parallèle avec les autres specs de ce groupe, un toast peut réapparaître
    // pendant l'attente qui suit (activité de fond de l'appli — polling
    // notifications, etc., plus sensible sous charge) : on referme donc une
    // deuxième fois juste avant le clic, et on force le clic en dernier
    // recours (le bouton est déjà vérifié visible/stable — seule une
    // superposition purement décorative est ici contournée).
    for (const fermer of await page.locator('.toast__close').all()) {
      await fermer.click().catch(() => {});
    }

    const envoyerBtn = page.locator('.detail-card__btns button.btn--dark');
    await expect(envoyerBtn).toBeVisible({ timeout: 15_000 });
    for (const fermer of await page.locator('.toast__close').all()) {
      await fermer.click().catch(() => {});
    }
    await envoyerBtn.click({ force: true });

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
