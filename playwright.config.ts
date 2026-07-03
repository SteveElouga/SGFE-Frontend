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
    {
      name: 'setup',
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

  // Serveur de dev local (hors CI)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://localhost:4200',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
