// Validates a local phone number: minimum 8 digits (Cameroun : numéros à 8 ou 9
// chiffres selon l'opérateur/l'ancienneté ; on n'impose plus le préfixe 6).
export const LOCAL_PHONE_REGEX = /^\d{8,15}$/;

export function isValidCameroonPhone(local: string): boolean {
  return LOCAL_PHONE_REGEX.test(local.trim());
}

// Prepends +237 before sending to the backend
export function normalizePhone(local: string): string {
  return `+237${local.trim()}`;
}

// Masks a full E.164 number for display: +237612345678 → +237 6XX XXX 678
export function maskPhone(e164: string): string {
  return e164.replace(/^(\+2376\d{2})\d{3}(\d{3})$/, '$1XXX$2');
}

// Strips +237 prefix when reading a pre-filled value from query params
export function toLocalPhone(value: string): string {
  return value.trim().replace(/^\+237/, '');
}
