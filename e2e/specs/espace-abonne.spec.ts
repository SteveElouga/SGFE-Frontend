import { test, expect } from '@playwright/test';

/**
 * Espace abonné public — écrans M-06 / MB-10 / 06 / 25 (`/espace/:token`).
 *
 * Contrairement à `terrain-saisie-index.spec.ts` et `paiement-encaissement.spec.ts`,
 * ce parcours reste dans le GATE CI, sans backend réel : la route
 * `/espace/:token` n'a AUCUN authGuard (accès par lien WhatsApp tokenisé), et
 * la seule dépendance backend est un unique GET HTTP
 * (`EspaceAbonneService.getFactures`, voir
 * `core/espace-abonne/espace-abonne.service.ts`) — interceptée ici avec
 * `page.route(...)` et une réponse figée. Ce n'est donc pas un mock du
 * métier de facturation (aucune règle n'est réimplémentée côté test, on fige
 * la réponse HTTP telle que la gateway la produirait) ; c'est un test du
 * rendu réel du composant à partir d'une réponse connue, exactement comme
 * `connexion.spec.ts` reste indépendant du backend en ne déclenchant aucun
 * appel réseau du tout.
 *
 * Vérifié dans le code avant d'écrire quoi que ce soit ici :
 *   - `EspaceAbonneComponent` classe les factures en 3 régimes (`solde`,
 *     `a-venir`, `retard`) et ne peint en rouge que la dette réellement échue
 *     — la distinction la plus utile de l'écran (voir la docstring du
 *     composant) ;
 *   - `EspaceAbonneService.getFactures` appelle
 *     `GET /espace-abonne/<token>/`, et une 401 fait passer l'état en
 *     `invalid` (`espace-abonne.component.ts::charger`).
 */

const ROUTE_PATTERN = '**/espace-abonne/**';

test.describe('Espace abonné public', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('une dette en partie échue affiche le régime "retard" et distingue la ligne en retard', async ({
    page,
  }) => {
    await page.route(ROUTE_PATTERN, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          abonne_id: 'abo-e2e-1',
          token_expiration: '2099-01-01',
          avoir: 0,
          factures: [
            // Échue depuis longtemps — doit déclencher le régime "retard" et le badge EN_RETARD.
            {
              facture_id: 'fac-echue',
              numero: 'F-2026-0001',
              date_releve: '2026-06-01',
              montant: 15_000,
              statut: 'IMPAYEE',
              date_limite_paiement: '2026-06-10',
              solde_restant: 15_000,
              montant_paye: 0,
              nature: 'CONSOMMATION',
              ancien_index: 100,
              nouveau_index: 115,
              consommation: 15,
              prix_m3: 1000,
            },
            // Déjà réglée — doit apparaître sous badge REGLEE, en fin de liste.
            {
              facture_id: 'fac-reglee',
              numero: 'F-2026-0002',
              date_releve: '2026-07-01',
              montant: 10_000,
              statut: 'PAYEE',
              date_limite_paiement: '2026-07-10',
              solde_restant: 0,
              montant_paye: 10_000,
              nature: 'CONSOMMATION',
              ancien_index: 115,
              nouveau_index: 125,
              consommation: 10,
              prix_m3: 1000,
            },
          ],
        }),
      });
    });

    await page.goto('/espace/token-e2e-valide');

    // Régime "retard" : le solde total et la part échue sont tous deux affichés.
    await expect(page.locator('.ea-solde__val')).toHaveText(/15\s?000/);
    await expect(page.locator('.ea-solde__sub')).toContainText('en retard');

    // Deux factures listées, dans l'ordre d'exigibilité (l'échue avant la réglée).
    const lignes = page.locator('.ea-liste .ea-fac');
    await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0)).toContainText('F-2026-0001');
    await expect(lignes.nth(0).locator('.ea-badge')).toContainText('En retard');
    await expect(lignes.nth(1)).toContainText('F-2026-0002');
    await expect(lignes.nth(1).locator('.ea-badge')).toContainText('Réglée');

    // Le relevé (index) justifie le montant de la facture échue.
    await expect(lignes.nth(0)).toContainText('100 → 115');

    // Le CSV et le PDF restent disponibles (navigation directe, non testée ici).
    await expect(page.locator('.ea-csv')).toBeVisible();
    await expect(lignes.nth(0).locator('.ea-pdf')).toBeVisible();
  });

  test('aucune facture à régler affiche le message "Tout est réglé"', async ({ page }) => {
    await page.route(ROUTE_PATTERN, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          abonne_id: 'abo-e2e-2',
          token_expiration: '2099-01-01',
          avoir: 0,
          factures: [],
        }),
      });
    });

    await page.goto('/espace/token-e2e-vide');

    await expect(page.locator('.ea-solde__ok')).toContainText('Tout est réglé');
    await expect(page.locator('.ea-carte__titre')).toContainText('Aucune facture');
  });

  test('un token invalide ou expiré (401) affiche un message dédié, pas une erreur générique', async ({
    page,
  }) => {
    await page.route(ROUTE_PATTERN, (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Token invalide ou expiré' }),
      });
    });

    await page.goto('/espace/token-e2e-invalide');

    await expect(page.locator('.ea-carte__titre')).toContainText('Lien invalide ou expiré');
    // La distinction 401 vs incident serveur compte : pas de bouton "Réessayer"
    // ici, un lien mort ne se corrige pas en relançant la même requête.
    await expect(page.locator('.ea-btn')).toHaveCount(0);
  });
});
