/**
 * Conversions entre `Date` (modèle de `p-datepicker`) et la chaîne `yyyy-mm-dd`
 * que les mutations/exports attendent. `Date#toISOString()` convertit en UTC :
 * pour qui saisit une date après minuit dans un fuseau négatif, elle recule
 * d'un jour. Ces deux fonctions restent en heure locale de bout en bout.
 */

/** `Date` → `yyyy-mm-dd` (heure locale). `null`/`undefined` → chaîne vide. */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `yyyy-mm-dd` → `Date` (minuit local). Chaîne vide/invalide → `null`. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}
