import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
  },

  projects: [
    // ── Setup : authentification ─────────────────────────────────────────────
    // `testDir` global vaut `./e2e/specs` ; le fichier de setup vit dans
    // `./e2e/fixtures`, donc hors périmètre. Ce projet ne collectait aucun
    // test et ne s'exécutait jamais — les trois projets qui en dépendent
    // pointaient donc vers des fichiers `storageState` inexistants. Élargir
    // `testDir` ici, et là seulement, remet la dépendance en état.
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: '**/fixtures/auth.setup.ts',
    },

    // ── Desktop (Admin / Comptable) ──────────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // ── Mobile (Agent terrain) — PWA mobile-first ────────────────────────────
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        storageState: 'e2e/.auth/agent.json',
      },
      dependencies: ['setup'],
    },

    // ── iOS Safari (validation PWA) ──────────────────────────────────────────
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
        storageState: 'e2e/.auth/agent.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Le serveur tourne aussi en CI.
  //
  // Il était `undefined` quand `CI` était posé : **rien ne servait
  // l'application**, et les tests n'avaient donc aucune page à visiter. Comme
  // le job passait par ailleurs `--pass-with-no-tests` sur un `testDir` vide,
  // le vert ne prouvait rien — ni que l'application démarre, ni qu'une route
  // répond.
  //
  // `reuseExistingServer` garde le confort local : un `ng serve` déjà lancé
  // est réutilisé au lieu d'être dupliqué.
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
