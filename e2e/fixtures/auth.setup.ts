import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';

// Chemins des fichiers d'état d'authentification (gitignorés)
const ADMIN_AUTH  = 'e2e/.auth/admin.json';
const AGENT_AUTH  = 'e2e/.auth/agent.json';

// Setup admin — à implémenter quand les tests seront écrits
setup('authenticate as admin', async ({ page }) => {
  fs.mkdirSync('e2e/.auth', { recursive: true });

  // TODO: implémenter le flow de login admin
  // await page.goto('/login');
  // await page.fill('[name=username]', process.env.E2E_ADMIN_USER!);
  // await page.fill('[name=password]', process.env.E2E_ADMIN_PASSWORD!);
  // await page.click('button[type=submit]');
  // await expect(page).toHaveURL('/dashboard');
  // await page.context().storageState({ path: ADMIN_AUTH });

  // Placeholder vide pour éviter l'erreur de fichier manquant
  fs.writeFileSync(ADMIN_AUTH, JSON.stringify({ cookies: [], origins: [] }));
});

// Setup agent terrain
setup('authenticate as agent', async ({ page }) => {
  fs.mkdirSync('e2e/.auth', { recursive: true });

  // TODO: implémenter le flow de login agent
  fs.writeFileSync(AGENT_AUTH, JSON.stringify({ cookies: [], origins: [] }));
});
