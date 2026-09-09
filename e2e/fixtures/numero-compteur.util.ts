import type { TestInfo } from '@playwright/test';

/**
 * Numéro de compteur jetable, unique même en exécution parallèle.
 *
 * `numero_compteur` porte une contrainte UNIQUE réelle côté backend
 * (`services/abonne/abonnes/models.py::Compteur.numero_compteur`,
 * `IntegerField(unique=True)`). Un simple `String(Date.now()).slice(-6)`
 * (utilisé initialement dans plusieurs specs) collisionne dès que deux
 * workers Playwright l'appellent à la même milliseconde — reproduit en
 * conditions réelles (`IntegrityError: duplicate key … numero_compteur=`)
 * en lançant `abonnes-resiliation.spec.ts` et
 * `abonnes-remplacement-compteur.spec.ts` en parallèle (réglage par défaut
 * hors CI, `playwright.config.ts::workers`).
 *
 * Composition (9 chiffres max, largement sous la limite `IntegerField`
 * Postgres — 2 147 483 647) : 6 derniers chiffres de l'horodatage + index du
 * worker Playwright (`testInfo.parallelIndex`, 0 par défaut hors parallélisme)
 * + 2 chiffres aléatoires. Ne garantit pas l'unicité à 100 % dans l'absolu,
 * mais rend une collision réelle négligeable pour un jeu de données de test
 * jetable — contrairement au découpage brut d'un horodatage seul.
 */
export function genererNumeroCompteur(testInfo: TestInfo): string {
  const suffixeHorodatage = Date.now().toString().slice(-6);
  const worker = (testInfo.parallelIndex % 10).toString();
  const alea = Math.floor(Math.random() * 90 + 10).toString();
  return `${suffixeHorodatage}${worker}${alea}`;
}
