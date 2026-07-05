/**
 * Drapeaux de capacité backend — SOURCE UNIQUE.
 *
 * Chaque booléen représente une capacité GraphQL du serveur. L'UI correspondante
 * est construite dès maintenant mais masquée / désactivée tant que le flag vaut
 * `false`. Quand le backend livre la capacité, passer le flag à `true` ICI, à un
 * seul endroit — aucun autre changement de code n'est nécessaire.
 *
 * Règle : ne JAMAIS afficher une donnée fabriquée comme si elle était réelle.
 * Tant qu'un flag est `false`, l'écran montre un état vide / « bientôt » explicite,
 * pas des lignes inventées.
 *
 * Contrat GraphQL attendu de chaque capacité : voir `docs/BACKEND_REQUIREMENTS.md`.
 */
export const BACKEND_CAPABILITIES = {
  /** ✅ Livré (introspection 2026-07-05) — mutations `reactivateUser` / `resetUserPassword` (écran 21b). */
  ACTIVATION_ACTIONS: true,

  /**
   * Query globale d'historique d'envois WhatsApp + champs `Envoi.messageId/statut/typeEnvoi`
   * (écran 23 ; complète le journal par-facture de l'écran 11).
   */
  WHATSAPP_ENVOI_HISTORY: false,

  /** Query `relanceEvents(factureId)` — vraie timeline des relances (écran 17, remplace la reconstruction front). */
  RELANCE_EVENTS: false,

  /** Champ `campagne.agents` (lecture) + mutation `retirerAgent` (écran 29 : pré-cochage / verrouillage / retrait). */
  CAMPAGNE_AGENTS_READ: false,

  /** Accès public tokenisé à l'espace abonné (écrans 06 / 25 / M-06 / MB-10). */
  ESPACE_ABONNE: false,

  /** Agrégats statistiques + exports (écran 13 / MB-08). */
  RAPPORTS: false,

  /** Dashboard superviseur filtré `created_by` (écran 32 / MC-06). */
  DASHBOARD_SUPERVISEUR: false,

  /** Notifications backend (query + subscription) — remplace les données de démonstration. */
  NOTIFICATIONS_BACKEND: false,
} as const;

export type BackendCapability = keyof typeof BACKEND_CAPABILITIES;

/** Indique si une capacité backend est disponible côté serveur. */
export function hasCapability(cap: BackendCapability): boolean {
  return BACKEND_CAPABILITIES[cap];
}
