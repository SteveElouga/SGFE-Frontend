import { test, expect, type APIRequestContext } from '@playwright/test';
import { genererNumeroCompteur } from '../fixtures/numero-compteur.util';

/**
 * Annulation d'un paiement (`AnnulerPaiement`, ADMIN et COMPTABLE — même
 * couple de rôles que l'encaissement, voir
 * `facture-detail.component.ts::peutAnnulerPaiement`).
 *
 * ── Fixture dédiée, corrigé le 10/09/2026 (course avec `facturation-envoi-
 *    whatsapp.spec.ts`) ────────────────────────────────────────────────────
 * Ce spec ciblait auparavant la PREMIÈRE ligne de `/impayes` (vue « Par
 * facture ») — une liste partagée et vivante, modifiable par n'importe quel
 * autre test au même instant. Collision reproduite en conditions réelles
 * (voir `e2e/README.md`, section « Specs ajoutées le 09/09/2026 ») :
 * `facturation-envoi-whatsapp.spec.ts` cible la même première ligne, donc
 * deux workers Playwright pouvaient agir sur LA MÊME facture en parallèle.
 *
 * Comme `campagnes-correction-releve.spec.ts`, ce spec construit désormais sa
 * propre fixture par API GraphQL (`request` de Playwright, compte ADMIN :
 * `createAbonne` → `creerCampagne(demarrerMaintenant: true)` →
 * `ajouterAbonnesCampagne` → `saisirIndex` → `genererFactures`) avant de
 * naviguer directement vers `/factures/<id>?paiement=1` — exactement l'URL
 * construite par `impayes-list.component.ts::ajouterPaiement()` (le bouton
 * « + Paiement » réel), donc le mécanisme UI vérifié est inchangé : seule la
 * manière de choisir la facture cible change. `genererFactures` n'exige pas
 * que la campagne soit clôturée (vérifié dans
 * `services/facturation/factures/grpc_server.py::GenererFactures`, qui lit
 * simplement tous les relevés de la campagne, quel que soit son statut) —
 * une campagne `EN_COURS` suffit, comme pour `campagnes-correction-releve`.
 *
 * Bénéfice secondaire : l'abonné de fixture porte un numéro WhatsApp
 * FABRIQUÉ (`+2376<horodatage>`, jamais un numéro réel), alors que la facture
 * partagée piochée auparavant appartenait à un abonné réel du jeu de
 * données — les deux envois WhatsApp déclenchés par ce spec (reçu +
 * relance d'annulation, voir plus bas) ne risquent donc plus de joindre un
 * numéro réel même si le garde-fou applicatif venait à manquer.
 *
 * Nécessite donc désormais `E2E_ADMIN_USER`/`E2E_ADMIN_PASSWORD` EN PLUS de
 * `E2E_COMPTABLE_USER`/`E2E_COMPTABLE_PASSWORD` (déjà exportées ensemble dans
 * la commande documentée par `e2e/README.md` pour ce groupe de onze specs) :
 * l'ADMIN construit la fixture (`createAbonne` est ADMIN uniquement,
 * `creerCampagne`/`ajouterAbonnesCampagne` ADMIN ou SUPERVISEUR, `saisirIndex`
 * ADMIN/AGENT/SUPERVISEUR — voir `gateway/schema/abonne_mutations.py` et
 * `campagne_mutations.py`) ; le COMPTABLE reste celui qui effectue le geste
 * UI réellement testé (enregistrer puis annuler un versement).
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
 * run** — sans l'un ou l'autre, DEUX messages WhatsApp partent à chaque
 * exécution (vers le numéro fabriqué de la fixture depuis le 10/09/2026, donc
 * sans risque de joindre un abonné réel, mais toujours un appel externe non
 * maîtrisé à éviter).
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
 * versement déjà annulé ne peut plus l'être (« Ce paiement est déjà annulé »).
 * Avant le 10/09/2026, le jeu de données partagé ne contenait pas de paiement
 * actif « jetable » : les paiements de démo alimentent `statsParMois`
 * (dashboard), les annuler fausserait durablement ces chiffres jusqu'au
 * prochain reseed. Désormais, ce spec crée sa propre facture ET son propre
 * paiement : l'enregistrer puis l'annuler aussitôt reste la seule séquence
 * possible pour exercer `AnnulerPaiement` (il faut un versement existant à
 * annuler), mais elle ne pollue plus qu'une facture entièrement jetable créée
 * pour l'occasion — plus aucun effet de bord sur les données partagées.
 *
 * ── Pourquoi ce spec n'est PAS dans le gate CI ──────────────────────────────
 * Même contrainte que `paiement-encaissement.spec.ts` : `.github/workflows/ci.yml`
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
    request,
  }, testInfo) => {
    // La fixture dédiée ajoute 5 appels API séquentiels (login ADMIN +
    // createAbonne + creerCampagne + ajouterAbonnesCampagne + saisirIndex +
    // genererFactures) avant même le scénario UI — le timeout par défaut de
    // Playwright (30s) laisse trop peu de marge une fois ce coût ajouté.
    test.setTimeout(60_000);

    // Écran back-office desktop — même contrainte que `paiement-encaissement.spec.ts`
    // (bouton de la vue tableau masqué sous 1024px).
    test.skip(
      testInfo.project.name !== 'chromium',
      'Écran COMPTABLE desktop — bouton de la vue tableau masqué sur mobile.',
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
    const marqueur = `E2EANN${Date.now().toString(36).toUpperCase()}`;
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

    // ── Enregistrement d'un versement sur cette facture dédiée ──────────────
    await page.goto('/login');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Même URL que celle construite par le bouton « + Paiement » de
    // `/impayes` (`impayes-list.component.ts::ajouterPaiement`), mais sur la
    // facture de fixture plutôt que sur la première ligne de la liste
    // partagée — ouvre automatiquement le formulaire de paiement
    // (`facture-detail.component.ts::autoOpenPaiement`).
    await page.goto(`/factures/${factureId}?paiement=1`);

    await expect(page).toHaveURL(/\/factures\/.+/);
    const form = page.locator('section.paiement-form');
    // `page.goto()` déclenche un rechargement complet de l'app (contrairement
    // au clic in-app sur « + Paiement » depuis `/impayes`, une simple
    // transition de route SPA) : bootstrap Angular + auth + chargement de la
    // facture avant que le formulaire n'apparaisse. Le timeout par défaut de
    // Playwright (5s) est trop juste sous charge (plusieurs specs de ce
    // groupe tournant en parallèle) — aligné sur les autres attentes de ce
    // fichier (8-10s).
    await expect(form).toBeVisible({ timeout: 15_000 });

    const submit = form.locator('button.paiement-form__submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Fenêtre d'annulation (Gmail-style Undo) de 5s avant l'appel API effectif
    // (`UNDO_WINDOW_MS`, `paiement-form.component.ts`) — le toast de succès
    // n'arrive qu'ensuite. Budget élargi à 15s (5s fixes d'attente + marge
    // réseau) : à 8s, les 3s restants après l'attente fixe suffisaient tant
    // que rien d'autre ne sollicitait le backend, mais laissaient trop peu de
    // marge en exécution parallèle avec les autres specs de ce groupe.
    await expect(page.locator('.toast.toast--success .toast__title')).toHaveText(
      'Paiement enregistré avec succès',
      { timeout: 15_000 },
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
