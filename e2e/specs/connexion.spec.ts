import { test, expect } from '@playwright/test';

/**
 * Test de fumée sur l'écran de connexion — la seule page que tout le monde
 * traverse.
 *
 * Il ne se connecte pas : le backend n'est pas disponible dans la CI du
 * frontend. Il vérifie ce qui ne dépend que du build, et qui casse en silence
 * quand quelque chose se dérègle :
 *
 *   — l'application démarre et route (un bundle cassé rend une page blanche
 *     avec un HTTP 200 ; seul un test qui attend un élément le voit) ;
 *   — les traductions se chargent (sans elles, l'écran affiche les clés
 *     brutes, `AUTH.SUBMIT` au lieu de « Se connecter ») ;
 *   — les deux champs et le bouton existent, avec les attributs
 *     d'autocomplétion que les gestionnaires de mots de passe utilisent.
 *
 * C'est délibérément modeste. Un test qui passe pour de vraies raisons vaut
 * mieux que `--pass-with-no-tests`, qui passait pour aucune.
 */
test.describe('Écran de connexion', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("l'application démarre et rend le formulaire", async ({ page }) => {
    await page.goto('/login');

    const identifiant = page.locator('#identifier');
    await expect(identifiant).toBeVisible();
    // Les gestionnaires de mots de passe s'appuient sur ces valeurs ; les
    // perdre ne casse aucun test unitaire mais dégrade tous les postes.
    await expect(identifiant).toHaveAttribute('autocomplete', 'username');

    const motDePasse = page.locator('#password');
    await expect(motDePasse).toBeVisible();
    await expect(motDePasse).toHaveAttribute('autocomplete', 'current-password');

    await expect(page.locator('button[type=submit]')).toBeVisible();
  });

  test('les traductions sont chargées', async ({ page }) => {
    await page.goto('/login');

    // Si ngx-translate n'a pas récupéré `/i18n/fr.json`, l'écran affiche les
    // clés telles quelles. Chercher l'absence de « AUTH. » attrape la panne
    // sans figer le libellé exact, qui a le droit de changer.
    await expect(page.locator('button[type=submit]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('AUTH.');
  });

  test('une route inconnue ne laisse pas un écran vide', async ({ page }) => {
    await page.goto('/cette-route-nexiste-pas');

    // `**` redirige vers `login`. Une redirection cassée donnait une page
    // blanche muette.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#identifier')).toBeVisible();
  });
});
