import { test, expect } from '@playwright/test';

test('charge la page d\'accueil sans erreur', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-root')).toBeAttached();
});
