# Tests e2e (Playwright)

## Ce qui tourne dans la CI aujourd'hui

`connexion.spec.ts` est le seul spec exécuté par le job `e2e` de
`.github/workflows/ci.yml`, qui n'a **pas** de backend disponible. Il ne se
connecte pas : il vérifie ce qui ne dépend que du build (démarrage, routage,
traductions) — voir le commentaire en tête du fichier.

## Specs qui nécessitent un backend réel

`terrain-saisie-index.spec.ts` et `paiement-encaissement.spec.ts` couvrent des
parcours métier réels (saisie d'index terrain, enregistrement d'un paiement)
qui ne peuvent pas être vérifiés sans un vrai backend GraphQL derrière — ce
seraient sinon des mocks du métier, pas des tests e2e.

**Ils ne font pas partie du gate CI.** Chacun se neutralise avec
`test.skip(...)` tant que la variable `E2E_LIVE_BACKEND` n'est pas posée, donc
dans `npx playwright test` de la CI ils apparaissent **skipped**, jamais
**failed**. Rien à changer côté CI pour ça : c'est le comportement par défaut.

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
2. Des comptes de test avec des données exploitables :
   - un compte `AGENT` avec une campagne `EN_COURS` contenant au moins un
     abonné encore « à relever » dans sa tournée ;
   - un compte `COMPTABLE` avec au moins une facture impayée (visible dans
     `/impayes`).
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

### `paiement-encaissement.spec.ts` — jamais exécuté, volontairement

Ce spec reste `test.skip(true, …)` **inconditionnellement**, même avec
`E2E_LIVE_BACKEND=1`. Enregistrer un paiement déclenche, côté backend, un
envoi **réel et automatique** du reçu WhatsApp pour ce versement — pas un
mock : le `whatsapp-service` tourne avec une session réellement connectée.

Vérifié dans le code avant d'écrire quoi que ce soit ici, pas supposé :
`SGFE-backend/services/paiement/paiements/grpc_server.py`,
`PaiementServicer._propager_versement()` appelle sans condition
`self._notification_client.envoyer_recu(...)` une fois par versement, et cette
méthode est invoquée depuis **les deux** RPC que le frontend utilise pour
enregistrer un paiement (`EnregistrerPaiement` et `EnregistrerPaiementAbonne`,
introduits dans le commit `feat(paiement): envoi auto du recu WhatsApp apres
paiement (#121)`). Il n'existe aujourd'hui aucun flag, mode test, ou compte
WhatsApp de bac à sable pour désactiver cet envoi.

Le bouton « Envoyer le reçu » du frontend (facture-detail, PR #159) est un
**renvoi manuel distinct** — il ne déclenche pas l'envoi automatique, il ne
permet pas non plus de l'éviter : l'envoi a déjà eu lieu à l'enregistrement,
avant même qu'un tel bouton soit accessible.

Ne retirer ce `test.skip` que lorsqu'un vrai garde-fou existera côté backend
(compte WhatsApp de test dédié, flag pour désactiver l'envoi en environnement
de test, ou mock du service de notification) — jamais en se fiant à l'absence
d'un clic sur « Envoyer le reçu » dans le test, qui ne change rien au
problème.

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
│   ├── connexion.spec.ts             # gate CI — pas de backend requis
│   ├── terrain-saisie-index.spec.ts  # hors gate CI — backend requis
│   └── paiement-encaissement.spec.ts # hors gate CI — backend requis,
│                                      # ET jamais exécuté (voir ci-dessus)
└── README.md              # ce fichier
```
