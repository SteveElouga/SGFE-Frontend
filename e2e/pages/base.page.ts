import { type Page, type Locator } from '@playwright/test';

/**
 * Classe de base pour tous les Page Objects.
 * Chaque page de l'app hérite de cette classe.
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  abstract readonly url: string;

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  get pageTitle(): Locator {
    return this.page.locator('app-page-topbar [data-testid="title"]');
  }
}
