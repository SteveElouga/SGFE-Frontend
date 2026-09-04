# Tests e2e (Playwright)

## Ce qui tourne dans la CI aujourd'hui

`connexion.spec.ts` et `espace-abonne.spec.ts` sont les seuls specs exécutés
par le job `e2e` de `.github/workflows/ci.yml`, qui n'a **pas** de backend
disponible.

- `connexion.spec.ts` ne se connecte pas : il vérifie ce qui ne dépend que du
  build (démarrage, routage, traductions) — voir le commentaire en tête du
  fichier.
- `espace-abonne.spec.ts` visite `/espace/:token` (page publique, sans
  authGuard) et intercepte avec `page.route(...)` l'unique appel HTTP dont
  cet écran dépend (`GET /espace-abonne/<token>/`) : la réponse est figée par
  le test, pas produite par un vrai backend, donc aucune dépendance réseau
  réelle. Ce n'est pas un mock du métier de facturation — on fige la réponse
  HTTP telle que la gateway la produirait, et on vérifie le rendu réel du
  composant à partir de cette réponse connue (3 régimes de dette, badges,
  état token invalide). Voir le commentaire en tête du fichier pour le détail.

## Specs qui nécessitent un backend réel

`terrain-saisie-index.spec.ts`, `paiement-encaissement.spec.ts`,
`dashboard-consultation.spec.ts` et `abonnes-gestion.spec.ts` couvrent des
parcours métier réels qui ne peuvent pas être vérifiés sans un vrai backend
GraphQL derrière — ce seraient sinon des mocks du métier, pas des tests e2e.

**Ils ne font pas partie du gate CI.** Chacun se neutralise avec
`test.skip(...)` tant que la variable `E2E_LIVE_BACKEND` n'est pas posée, donc
dans `npx playwright test` de la CI ils apparaissent **skipped**, jamais
**failed**. Rien à changer côté CI pour ça : c'est le comportement par défaut.

| Spec                             | Écrit des données ?                                                                  | Rôle(s) requis        |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| `terrain-saisie-index.spec.ts`   | Oui — un vrai relevé à chaque exécution                                              | `AGENT`               |
| `paiement-encaissement.spec.ts`  | Oui — un vrai paiement à chaque exécution, **⚠️ voir garde-fou WhatsApp ci-dessous** | `COMPTABLE`           |
| `dashboard-consultation.spec.ts` | Non — lecture seule                                                                  | `ADMIN` + `COMPTABLE` |
| `abonnes-gestion.spec.ts`        | Non — lecture seule (liste, recherche, fiche)                                        | `ADMIN`               |

### Prérequis pour les lancer en local

1. La stack `SGFE-backend` (dépôt séparé) tournant via `docker compose`,
   servie en HTTPS sur `https://localhost:8443` (certificat auto-signé de
   dev, à générer une fois avec `./scripts/generate-nginx-cert.sh` avant le
   premier démarrage — sans lui, nginx refuse de démarrer) :

   ```bash
   cd ../SGFE-backend    # ou le chemin réel du dépôt backend
   ./scripts/generate-nginx-cert.sh    # une seule fois, certs gitignorés
   docker compose up -d
   docker compose ps     # vérifier que tout est "healthy"
   ```

   Playwright passe par le proxy de `ng serve` (`proxy.conf.json`), qui
   cible déjà `https://localhost:8443` — rien à configurer côté e2e.

   **Avant de lancer `paiement-encaissement.spec.ts` en particulier**, voir
   l'avertissement WhatsApp dédié plus bas — un `docker compose up -d` "nu"
   ne suffit PAS pour ce spec précis.

2. Des comptes de test avec des données exploitables :
   - un compte `AGENT` avec une campagne `EN_COURS` contenant au moins un
     abonné encore « à relever » dans sa tournée ;
   - un compte `COMPTABLE` avec au moins une facture impayée (visible dans
     `/impayes`) ;
   - un compte `ADMIN` (pour `dashboard-consultation.spec.ts` et
     `abonnes-gestion.spec.ts`) ;
   - pour `abonnes-gestion.spec.ts` : le numéro ou le nom d'un abonné existant
     dans le parc de ce compte `ADMIN`, connu à l'avance (variable
     `E2E_ABONNE_RECHERCHE`) — utilisé comme terme de recherche pour vérifier
     que le filtrage fonctionne vraiment, plutôt que de cliquer la première
     ligne d'une liste non filtrée.
3. Le frontend servi normalement (Playwright le démarre lui-même via
   `webServer` dans `playwright.config.ts`, comme en CI).

### Lancer

```bash
E2E_LIVE_BACKEND=1 \
E2E_AGENT_USER=... E2E_AGENT_PASSWORD=... \
E2E_COMPTABLE_USER=... E2E_COMPTABLE_PASSWORD=... \
npx playwright test e2e/specs/terrain-saisie-index.spec.ts
```

`terrain-saisie-index.spec.ts` **écrit un vrai relevé** dans la campagne en
cours à chaque exécution (la file `OfflineSaisieService` synchronise dès que
le navigateur est en ligne) — à ne lancer que contre une stack locale/jetable,
jamais contre un environnement partagé.

```bash
E2E_LIVE_BACKEND=1 \
E2E_ADMIN_USER=... E2E_ADMIN_PASSWORD=... \
E2E_COMPTABLE_USER=... E2E_COMPTABLE_PASSWORD=... \
npx playwright test e2e/specs/dashboard-consultation.spec.ts
```

```bash
E2E_LIVE_BACKEND=1 \
E2E_ADMIN_USER=... E2E_ADMIN_PASSWORD=... \
E2E_ABONNE_RECHERCHE="0123456789" \
npx playwright test e2e/specs/abonnes-gestion.spec.ts
```

Ces deux derniers specs sont purement en LECTURE : ils ne créent ni ne
modifient aucune donnée, rejouables sans effet de bord sur n'importe quel
environnement de test.

### `paiement-encaissement.spec.ts` — ⚠️ garde-fou WhatsApp obligatoire

Enregistrer un paiement déclenche, côté backend, un envoi **réel et
automatique** du reçu WhatsApp pour ce versement — pas un mock : le
`whatsapp-service` tourne avec une session réellement connectée.

Vérifié dans le code avant d'écrire quoi que ce soit ici, pas supposé :
`SGFE-backend/services/paiement/paiements/grpc_server.py`,
`PaiementServicer._propager_versement()` appelle sans condition
`self._notification_client.envoyer_recu(...)` une fois par versement, et cette
méthode est invoquée depuis **les deux** RPC que le frontend utilise pour
enregistrer un paiement (`EnregistrerPaiement` et `EnregistrerPaiementAbonne`,
introduits dans le commit `feat(paiement): envoi auto du recu WhatsApp apres
paiement (#121)`).

Le backend expose désormais un garde-fou dédié (dépôt `SGFE-backend`,
`notifications/whatsapp_client.py`) : la variable d'environnement
`WHATSAPP_DISABLE_SEND_FOR_TESTS` (`"1"`/`"true"`), posée sur le service
`notification-service`, fait que `send()`/`send_with_pdf()` **ne contactent
plus jamais** le vrai `whatsapp-service` — succès simulé, log explicite côté
backend (`"[TEST] envoi WhatsApp simulé, désactivé par
WHATSAPP_DISABLE_SEND_FOR_TESTS"`). Voir la docstring de ce module côté
backend pour les deux façons de l'activer sur une stack de test locale
(`docker-compose.yml` sur `notification-service`, ou
`docker compose run -e WHATSAPP_DISABLE_SEND_FOR_TESTS=1`).

> ⚠️ ⚠️ ⚠️ **AVERTISSEMENT — À LIRE AVANT DE LANCER CE SPEC** ⚠️ ⚠️ ⚠️
>
> Ce spec est gated par `E2E_LIVE_BACKEND`, **exactement comme les autres**
> — mais ce gate protège seulement de l'exécuter sans backend du tout. Il ne
> protège PAS d'un backend démarré SANS `WHATSAPP_DISABLE_SEND_FOR_TESTS`.
>
> **Lancer ce spec contre une stack backend dont `notification-service` ne
> porte pas cette variable déclenche un vrai message WhatsApp vers le numéro
> réel d'un abonné.** Ce n'est pas hypothétique : c'est le comportement par
> défaut de `docker-compose.yml` (la variable n'y est jamais posée par
> défaut, intentionnellement — voir sa docstring).
>
> Avant de lancer ce spec, vérifier explicitement que `notification-service`
> tourne avec `WHATSAPP_DISABLE_SEND_FOR_TESTS=1` :
>
> ```bash
> docker compose exec notification-service printenv WHATSAPP_DISABLE_SEND_FOR_TESTS
> # doit afficher "1" (ou "true") — sinon NE PAS lancer ce spec.
> ```

```bash
E2E_LIVE_BACKEND=1 \
E2E_COMPTABLE_USER=... E2E_COMPTABLE_PASSWORD=... \
npx playwright test e2e/specs/paiement-encaissement.spec.ts
```

Le bouton « Envoyer le reçu » du frontend (facture-detail, PR #159) est un
**renvoi manuel distinct** — il ne déclenche pas l'envoi automatique, il ne
permet pas non plus de l'éviter : l'envoi a déjà eu lieu à l'enregistrement,
avant même qu'un tel bouton soit accessible. Ce spec ne l'appelle jamais.

## Ce qui est couvert aujourd'hui, et ce qui ne l'est toujours pas

Couvert : connexion (build/routage/traductions), espace abonné public (3
régimes de dette, token invalide — CI, sans backend), saisie d'index terrain,
enregistrement d'un paiement (avec garde-fou WhatsApp), consultation du
dashboard par rôle (ADMIN/COMPTABLE), et l'entrée de la gestion des abonnés
(liste, recherche, fiche détail).

Pas encore couvert (hors périmètre de cette itération, honnêtement) :

- Les mutations de gestion des abonnés elles-mêmes (créer, suspendre,
  réactiver, résilier, remplacer un compteur) — `abonnes-gestion.spec.ts`
  reste volontairement en lecture seule.
- Les campagnes (création, clôture, affectation d'agents/zones).
- La facturation (génération de factures, PDF, envois en masse).
- Les impayés et le cycle de relance automatique (cron `ImpayeCheckerJob`).
- Les vues SUPERVISEUR (dashboard et campagnes filtrées par `createdBy`).
- La PWA (mode hors-ligne réel, installation, notifications push).

## Structure

```
e2e/
├── fixtures/
│   └── auth.setup.ts     # projet "setup" — login pré-fabriqué (TODO, non
│                          # implémenté ; les specs ci-dessus font leur
│                          # propre login réel plutôt que d'en dépendre)
├── pages/
│   └── base.page.ts      # Page Object de base
├── specs/
│   ├── connexion.spec.ts               # gate CI — pas de backend requis
│   ├── espace-abonne.spec.ts           # gate CI — HTTP interceptée, pas de backend requis
│   ├── terrain-saisie-index.spec.ts    # hors gate CI — backend requis, écrit un relevé
│   ├── paiement-encaissement.spec.ts   # hors gate CI — backend requis,
│   │                                    # ET garde-fou WhatsApp obligatoire (voir ci-dessus)
│   ├── dashboard-consultation.spec.ts  # hors gate CI — backend requis, lecture seule
│   └── abonnes-gestion.spec.ts         # hors gate CI — backend requis, lecture seule
└── README.md              # ce fichier
```
