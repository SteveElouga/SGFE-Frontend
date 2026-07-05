# Audit des écrans AquaBill — conformité au design

> Réf. design : `docs/design_handoff_aquabill/README.md` (32 écrans desktop + 21b, M-01→08, MB-01→10, MC-01→06).
> Croisé avec le code réel (`src/app/features/*`) et les limites backend connues.
> Date : 2026-07-05.

**Légende :** ✅ conforme · 🟡 écart · ⛔ non fait · *(M-/MB-/MC- = variantes mobiles des écrans desktop)*

## 1. Vue d'ensemble

| État | Nb | Signification |
|---|---|---|
| ✅ Fait & conforme | ~38 | Implémenté, fidèle (à ±détails mineurs) |
| 🟡 Fait avec écart | 8 | Diverge du design ou bridé backend |
| ⛔ Non fait | 5 familles | Placeholder « bientôt » ou absent |

## 2. Auth

| # | Écran | Composant | État | Écart |
|---|---|---|---|---|
| 01 / M-01 | Connexion (erreur) | `auth/login` | 🟡 | Blocage « 5 tentatives / 15 min » (EF-AUTH-001, RV-007) non visible côté client (probablement délégué backend). |
| 02 / M-03 | Création de compte (checklist mdp) | `auth/set-password` + `auth-password-pair` | ✅ | Pas d'inscription publique → mappé sur l'activation. |
| 03 / M-02 | Mot de passe oublié | `auth/forgot-password` | ✅ | Dépasse le design : bascule E-mail / WhatsApp OTP. |
| 27 / MC-01 | Activation par OTP | `auth/activate-otp` | ✅ | Code 6 chiffres + mdp. |
| 28 / MC-02 | Reset par OTP WhatsApp | `auth/forgot-password` | ✅ | Onglets E-mail / WhatsApp. |

## 3. Admin / Agent / Comptable

| # | Écran | Composant | État | Écart |
|---|---|---|---|---|
| 01 / M-04 | Dashboard Admin | `dashboard` | ✅ | KPI + activité. |
| 02 / M-05 | Abonnés · Liste | `abonnes/list` | 🟡 | Cartes mobiles `appCardRow` perdues au pull amont (à revérifier). |
| 03 / MB-01 | Fiche Abonné | `abonnes/detail` | ✅ | Dépasse : onglets Info/Factures/Conso/Impayés/Historique. |
| 04 | Campagnes · Liste | `campagnes/list` | ✅ | |
| 05 / MB-02 | Suivi Campagne | `campagnes/detail` | ✅ | Progression, relevés par statut, filtres. |
| 06 / M-06 | Espace Abonné public | `espace-abonne` | ⛔ | Placeholder. Bloqué : accès tokenisé backend. |
| 07–09 | Agent Mobile | `terrain` | ✅ | Conso live (RV-001), ≤ 3 taps, succès. |
| 10 / MB-04 | Factures + paiement | `facturation/list` + `detail` | ✅ | |
| 11 / MB-05 | Détail Facture | `facturation/detail` | 🟡 | Journal WhatsApp partiel (`Envoi.typeEnvoi` manquant) ; statut/solde = heuristique front. |
| 12 | Liste Paiements | `paiements/list` | 🟡 | Colonne Opérateur en « — » ; export CSV à confirmer. |
| 13 / MB-08 | Rapports & Exports | `rapports` | ✅ | Livré (PR #34) : KPIs `statsGlobales` + 4 exports serveur (CSV factures/paiements, PDF synthèse/bilan). |
| 14 | Formulaire Abonné (modif) | `abonnes/form` | ✅ | |
| 15 | Création Campagne | `campagnes/form` | ✅ | |

## 4. Compléments (16–32)

| # | Écran | Composant | État | Écart |
|---|---|---|---|---|
| 16 / MB-07 | Gestion des Impayés | `impayes/list` | ✅ | Étapes relance, pause acompte 5 j. |
| 17 | Historique des relances | `impayes/relances` | 🟡 | Timeline reconstruite front (pas de query `relance-events`). |
| 18 / MB-02 | Clôture campagne (modal) | `campagnes/detail` | ✅ | |
| 19 | Remplacement compteur (modal) | `abonnes/detail` | ✅ | |
| 20 / MB-09 | Paramètres (4 onglets) | `configuration` + `whatsapp-link` | ✅ | |
| 21 | Gestion utilisateurs | `utilisateurs/list` | ✅ | |
| 21b | Modifier utilisateur | `utilisateurs/edit` | 🟡 | Réactiver / renvoyer lien bridés par flag `ACTIVATION_ACTIONS_READY`. |
| 22 | Mon profil | `profil` | ✅ | |
| 23 | Suivi envois WhatsApp | `envois` | ⛔ | Placeholder. Bloqué : query envois / `messageId` / statut. |
| 24 | Facture PDF (visuel) | `facturation/detail` → `openPdf()` | ✅ | PDF backend ReportLab. |
| 25 / MB-10 | Espace abonné lien expiré | `espace-abonne` | ⛔ | Couvert par le placeholder. |
| 26 | Toasts / Feedback | `toast/toast-container` | ✅ | |
| 29 / MC-03 | Affectation d'agents | `campagnes/agents-sheet` | 🟡 | Add-only ; pas de pré-cochage/verrouillage (pas de read-path `campagne.agents`) ni `retirerAgent`. |
| 30 / MC-04 | Modifier le tarif | `configuration` (inline) | 🟡 | Édition inline au lieu d'une modale dédiée. |
| 31 / MC-05 | Résiliation abonné (modal) | `abonnes/detail` | ✅ | |
| 32 / MC-06 | Dashboard Superviseur | — | ⛔ | Pas de vue filtrée `created_by` dédiée. |

## 5. Mobiles spécifiques

| # | Écran | Couvert par | État |
|---|---|---|---|
| M-07 / MB-03 | Agent Non relevé / Estimé (sheet) | `terrain` | ✅ |
| M-08 | Agent mode hors ligne | `terrain` + `offline-saisie.service` | ✅ |
| MB-06 | Enregistrement paiement (sheet) | `facturation/detail` | ✅ |

## 6. Hors maquette (ajouts)

| Élément | Composant | Note |
|---|---|---|
| Centre de notifications | `notification-bell` + `notifications` | Pas au catalogue ; données de démonstration (`seed()`), pas de backend. |
| Navigation mobile (tiroir + onglets) | `sidebar` + `bottom-tabs` | Adaptation mobile ajoutée. |

---

## 7. Stratégie recommandée pour les écarts BLOQUÉS BACKEND

**Option retenue : « flags de capacité centralisés + dégradation gracieuse » — jamais de fausse donnée présentée comme réelle.**

Principes :

1. **Centraliser les flags de capacité backend** dans un seul fichier
   (`src/app/core/config/backend-capabilities.ts`), un booléen par capacité
   manquante. Généralise le pattern existant `ACTIVATION_ACTIONS_READY`.
2. **Construire l'UI complète maintenant, la masquer/désactiver derrière le flag.**
   Quand le backend livre, on bascule un booléen — zéro re-dev.
3. **Ne jamais fabriquer de donnée fausse présentée comme réelle.**
   - Pur affichage (journal WhatsApp, envois) → état vide « — » / « aucun envoi »,
     pas de lignes inventées.
   - Reconstruction tolérée si dérivée de vraies données (étape d'impayé calculée
     depuis les échéances) → à garder MAIS étiqueter « estimée ».
4. **Une seule liste de besoins backend** (ce fichier + `docs/ETAT_DU_SYSTEME.md`).

Par écart :

| Écart | Meilleure option |
|---|---|
| 01 lockout | Laisser au **backend** (sécurité serveur = correct ; un lockout client est contournable). Front : afficher le message + un compteur seulement si le backend renvoie `remainingAttempts`. |
| 11 `typeEnvoi` / journal WhatsApp | Flag `WHATSAPP_ENVOI_HISTORY`. En attendant : masquer le journal ou état vide, pas de lignes inventées. |
| 17 timeline relances | Garder la reconstruction (dérivée de vraies dates) mais la **marquer « estimée »** ; flag `RELANCE_EVENTS` pour basculer sur les vrais events. |
| 21b actions activation | Déjà la bonne approche (flag `ACTIVATION_ACTIONS_READY`). Rien à changer, juste flipper. |
| 29 pré-cochage agents | Flag `CAMPAGNE_AGENTS_READ`. En attendant : rester add-only, désactiver le pré-cochage plutôt que deviner. |
| Notifications (hors maquette) | Idem : flag `NOTIFICATIONS_BACKEND` ; en attendant, état vide plutôt que seed visible comme réel. |

**Résumé :** un seul mécanisme (flags), l'UI prête et masquée, aucune donnée fabriquée
affichée comme réelle. Le seul « non-fait » réellement débloquable côté front sans
backend est le **Dashboard Superviseur (32)** dès que le filtrage `created_by` est exposé.
