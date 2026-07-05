# Instructions backend — capacités à livrer pour débloquer le frontend

Le frontend Angular parle **exclusivement GraphQL** via l'API Gateway. Chaque
capacité ci-dessous correspond à un drapeau dans
`src/app/core/config/backend-capabilities.ts` (front). **Quand vous livrez une
capacité, dites-le : on passe le flag correspondant à `true`** (un seul endroit,
zéro re-dev).

Règle de contrat : le front ne fabrique jamais de fausse donnée. Tant qu'une
capacité manque, l'écran affiche un état vide / « bientôt » — pas des lignes
inventées. Livrez les vraies données, le front les branche.

Convention : types indicatifs (adaptez au schéma existant) ; `DateTime` ISO-8601 ;
montants en FCFA (entiers ou float selon le schéma actuel).

---

## Priorité 1 — débloque des écrans entiers

### A. `WHATSAPP_ENVOI_HISTORY` — Suivi des envois (écran 23) + journal facture (écran 11)

Le détail facture affiche déjà un journal par-facture (`envoi.typeEnvoi`). Il
manque **la query globale** et les champs de suivi complets.

```graphql
enum TypeEnvoi { FACTURE RELANCE RECU LIEN_ABONNE }
enum StatutEnvoi { DELIVRE EN_ATTENTE ECHEC }

type Envoi {
  id: ID!
  factureId: ID
  numeroFacture: String
  destinataire: String!        # numéro WhatsApp
  abonneNom: String
  typeEnvoi: TypeEnvoi!
  statut: StatutEnvoi!
  messageId: String            # ID whatsapp-web.js
  raisonEchec: String          # renseigné si statut = ECHEC
  dateEnvoi: DateTime!
}

type Query {
  envois(statut: StatutEnvoi, type: TypeEnvoi, limit: Int, offset: Int): [Envoi!]!
}

type Mutation {
  # Renvoi MANUEL uniquement (aucun retry auto). Régénère un token abonné si besoin.
  renvoyerEnvoi(envoiId: ID!): Envoi!
}
```

### B. `ESPACE_ABONNE` — Espace abonné public (écrans 06 / 25 / M-06 / MB-10)

Accès **public, sans JWT**, validé par le token du lien WhatsApp (`/espace/:token`).

```graphql
type EspaceAbonne {
  abonneNom: String!
  abonnePrenom: String
  numeroAbonne: String!
  factures: [FacturePublique!]!
  consommation: [ConsoMois!]!   # ~6 derniers mois
  tokenExpiration: DateTime!
}

type Query {
  # Résolveur PUBLIC. Renvoie une erreur typée si le token est invalide/expiré/révoqué.
  espaceAbonne(token: String!): EspaceAbonne
}
```

- Erreur token → **code distinct** (`TOKEN_EXPIRED`, `TOKEN_REVOKED`) pour afficher
  l'écran 25 « lien expiré » et son CTA « nouveau lien ».
- Exports PDF/CSV : endpoints REST tokenisés (ReportLab), pas de GraphQL.

### C. `RAPPORTS` — Rapports & exports (écran 13 / MB-08)

```graphql
type RapportMois { mois: String!  facture: Float!  encaisse: Float!  impaye: Float! }

type RapportSynthese {
  totalFacture: Float!
  totalEncaisse: Float!
  totalImpaye: Float!
  tauxRecouvrement: Float!      # 0..100
  consommationTotale: Float!    # m³
  parMois: [RapportMois!]!
}

type Query {
  rapportSynthese(anneeDebut: Int, moisDebut: Int, anneeFin: Int, moisFin: Int): RapportSynthese!
}
```

- 4 exports = endpoints REST tokenisés : PDF mensuel, CSV factures, CSV paiements,
  bilan impayés.

---

## Priorité 2 — améliore des écrans existants (déjà fonctionnels en dégradé)

### D. `CAMPAGNE_AGENTS_READ` — Affectation d'agents (écran 29)

Aujourd'hui seul `affecterAgent(campagneId, agentId)` existe (écriture). Le sheet
ne peut donc ni pré-cocher les déjà-affectés, ni verrouiller, ni retirer.

```graphql
type Campagne {
  # ... champs existants
  agents: [Agent!]!            # AJOUT : agents actuellement affectés (LECTURE)
}

type Mutation {
  retirerAgent(campagneId: String!, agentId: String!): Campagne!   # AJOUT
}
```

### E. `RELANCE_EVENTS` — Historique des relances (écran 17)

Le front reconstruit actuellement la timeline à partir des dates d'échéance
(marquée « estimée »). Fournir les vrais événements :

```graphql
type RelanceEvent {
  id: ID!
  factureId: ID!
  etape: Int!                  # 1..4
  message: String              # texte réel du message WhatsApp
  statut: StatutEnvoi
  dateEnvoi: DateTime!
}

type Query {
  relanceEvents(factureId: ID!): [RelanceEvent!]!
}
```

### F. `DASHBOARD_SUPERVISEUR` — Dashboard superviseur (écran 32 / MC-06)

Le rôle SUPERVISEUR ne doit voir que **ses** campagnes (`created_by`). C'est le
seul « non-fait » débloquable côté front **sans nouveau type** — juste un filtrage.

- **Recommandé** : que les queries dashboard/campagnes appliquent automatiquement
  le périmètre selon le rôle du JWT (le superviseur reçoit déjà sa vue filtrée).
- **Alternative** : exposer `campagnes(mine: true)` ou `campagnes(createdBy: ID)`.

### G. `NOTIFICATIONS_BACKEND` — Centre de notifications (hors maquette, ajout)

Tourne sur des données de démonstration (`seed()`). Remplacer par :

```graphql
type Notification {
  id: ID!
  type: String!                # INFO | ALERTE | PAIEMENT | RELANCE ...
  titre: String!
  message: String!
  lu: Boolean!
  dateCreation: DateTime!
  lien: String                 # route cible optionnelle
}

type Query    { notifications: [Notification!]! }
type Mutation {
  marquerNotificationLue(id: ID!): Notification!
  marquerToutesLues: Boolean!
}
type Subscription { notificationRecue: Notification! }   # temps réel (optionnel)
```

---

## Priorité 3 — sécurité / UX (optionnel côté GraphQL)

### H. Lockout connexion (écran 01)

Le blocage **5 tentatives / 15 min** (EF-AUTH-001, RV-007) doit être appliqué
**côté serveur** (un lockout client est contournable). Pour l'UX, exposer
optionnellement dans l'erreur d'authentification :

```
{ code: "ACCOUNT_LOCKED", remainingSeconds: Int, remainingAttempts: Int }
```

Le front affichera le compte à rebours / le nombre d'essais restants ; sans ces
champs il montre juste le message générique (comportement actuel).

---

## Récapitulatif — flag ↔ capacité

| Flag front | Écran(s) | Livrable backend |
|---|---|---|
| `ACTIVATION_ACTIONS` | 21b | ✅ **livré** (`reactivateUser`, `resetUserPassword`) |
| `WHATSAPP_ENVOI_HISTORY` | 11, 23 | Query `envois` + `Envoi.{messageId,statut,typeEnvoi,raisonEchec}` + `renvoyerEnvoi` |
| `ESPACE_ABONNE` | 06, 25, M-06, MB-10 | Query publique `espaceAbonne(token)` + erreurs `TOKEN_EXPIRED/REVOKED` |
| `RAPPORTS` | 13, MB-08 | ✅ **livré** (PR #34) — `statsGlobales` (GraphQL) + 4 exports REST (CSV/PDF) |
| `CAMPAGNE_AGENTS_READ` | 29, MC-03 | 🟡 read-path livré (`agentsCampagne`, `repartitionParZone`, `resumeCloture`) ; `retirerAgent` / `affecterZones` restants |
| `RELANCE_EVENTS` | 17 | Query `relanceEvents(factureId)` |
| `DASHBOARD_SUPERVISEUR` | 32, MC-06 | Filtrage `created_by` (rôle JWT) |
| `NOTIFICATIONS_BACKEND` | (centre notif.) | Query/mutations/subscription `notifications` |
| _(pas de flag)_ | 01 | Lockout serveur + champs d'erreur optionnels |

> Quand une ligne est livrée : passer le flag à `true` dans
> `src/app/core/config/backend-capabilities.ts`.
