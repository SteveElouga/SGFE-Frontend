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
`dashboard-consultation.spec.ts`, `abonnes-gestion.spec.ts` et les onze specs
ajoutées le 09/09/2026 (voir « Specs ajoutées le 09/09/2026 » plus bas)
couvrent des parcours métier réels qui ne peuvent pas être vérifiés sans un
vrai backend GraphQL derrière — ce seraient sinon des mocks du métier, pas des
tests e2e.

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

Les onze specs suivantes, ajoutées le 09/09/2026, sont détaillées dans leur
propre section plus bas (« Specs ajoutées le 09/09/2026 ») : `abonnes-resiliation.spec.ts`,
`abonnes-remplacement-compteur.spec.ts`, `campagnes-correction-releve.spec.ts`,
`paiements-annulation.spec.ts`, `communication-diffusion.spec.ts`,
`facturation-envoi-whatsapp.spec.ts`, `utilisateurs-creation.spec.ts`,
`rapports-export.spec.ts`, `configuration-parametres.spec.ts`,
`profil-reset-password.spec.ts`, `notifications-marquer-lu.spec.ts`.

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

## Specs ajoutées le 09/09/2026

Onze specs, écrites en réponse au trou de couverture le plus sévère de l'audit
« Radiographie SGFE » (09/09/2026) : « résilier un abonné, annuler un paiement,
remplacer un compteur, corriger un relevé, envoyer une diffusion WhatsApp —
aucun de ces gestes n'est jamais rejoué contre un vrai backend ». Toutes
suivent le même style que les specs déjà en place (gate `E2E_LIVE_BACKEND`,
`storageState` vide, login réel, `test.skip` desktop/mobile où pertinent).

**Différence de conception assumée** : plutôt que de dépendre d'un abonné ou
d'une campagne particulière du jeu de données partagé (fragile — voir
l'avertissement sur l'état constaté du seed, plus bas), la plupart créent leur
propre fixture jetable (un abonné, une campagne, un utilisateur) via le
formulaire réel ou par API GraphQL directe (`request` de Playwright), avant de
n'exercer l'UI que pour le geste réellement testé. `abonnes-resiliation`,
`abonnes-remplacement-compteur`, `campagnes-correction-releve`,
`paiements-annulation` et `facturation-envoi-whatsapp` sont ainsi intégralement
autonomes et rejouables indéfiniment, contrairement à
`terrain-saisie-index.spec.ts` qui reste contrainte par un budget de seed fixe.

> ⚠️ **Corrigé le 09/09/2026** (contre-vérification indépendante) : cette
> section affirmait la même autonomie pour les **onze** specs sans distinction.
> Faux pour deux d'entre eux — `paiements-annulation.spec.ts` et
> `facturation-envoi-whatsapp.spec.ts` passaient tous les deux par `/impayes`
> (vue « Par facture ») et agissaient sur la **première ligne** de cette liste
> partagée et vivante, sans créer leur propre facture. En exécution parallèle
> (réglage par défaut de Playwright hors CI, `workers: undefined`), deux
> workers pouvaient cibler la même facture au même moment — collision
> reproduite en conditions réelles (`paiements-annulation.spec.ts` échouait en
> parallèle, passait systématiquement une fois sérialisé). De même,
> `numeroCompteur` (contrainte UNIQUE réelle en base,
> `Compteur.numero_compteur`) était généré par un simple
> `String(Date.now()).slice(-6)` dans trois specs (`abonnes-resiliation`,
> `abonnes-remplacement-compteur`, `campagnes-correction-releve`) — collision
> également reproduite en parallèle (`IntegrityError: duplicate key …
> numero_compteur=`), corrigée depuis via `e2e/fixtures/numero-compteur.util.ts`
> (horodatage + index de worker + aléa).
>
> **✅ Corrigé le 10/09/2026** — la collision `/impayes` ci-dessus : les deux
> specs construisent désormais leur propre fixture dédiée (abonné + campagne
> `EN_COURS` + relevé + facture, via l'API GraphQL — même mécanisme que
> `campagnes-correction-releve.spec.ts`, jusqu'à réutiliser
> `genererNumeroCompteur`) avant de naviguer directement vers
> `/factures/<id>` (`facturation-envoi-whatsapp`) ou `/factures/<id>?paiement=1`
> (`paiements-annulation` — l'URL exacte construite par le bouton « + Paiement »
> réel de `/impayes`, donc le mécanisme UI vérifié n'a pas changé, seule la
> sélection de la facture cible). Chacune agit désormais sur une facture que
> nul autre test ne peut toucher. Vérifié par lancers répétés de ces deux
> specs **et** `communication-diffusion.spec.ts` ensemble, en parallèle réel
> (`--workers=3`, plusieurs exécutions consécutives) contre un backend réel :
> plus aucune collision observée. `--workers=1` n'est donc plus nécessaire
> pour ces trois specs précisément (voir aussi la note sur
> `communication-diffusion.spec.ts` ci-dessous, jamais concernée par ce risque
> pour une raison différente).
>
> **En pratique** : la commande ci-dessous garde `--workers=1` pour le lot
> complet des onze specs, car les cinq autres (`utilisateurs-creation`,
> `rapports-export`, `configuration-parametres`, `profil-reset-password`,
> `notifications-marquer-lu`) n'ont pas fait l'objet du même audit
> d'indépendance — prudence, pas un risque avéré. Isolément, les six specs
> déjà vérifiées autonomes (`abonnes-resiliation`,
> `abonnes-remplacement-compteur`, `campagnes-correction-releve`,
> `paiements-annulation`, `facturation-envoi-whatsapp`,
> `communication-diffusion`) tournent en parallèle sans `--workers=1` :
>
> ```bash
> E2E_ADMIN_USER=demo_admin E2E_ADMIN_PASSWORD='Demo1234!' \
> E2E_COMPTABLE_USER=demo_comptable E2E_COMPTABLE_PASSWORD='Demo1234!' \
> E2E_LIVE_BACKEND=1 \
> npx playwright test --workers=3 --project=chromium \
>   e2e/specs/paiements-annulation.spec.ts \
>   e2e/specs/facturation-envoi-whatsapp.spec.ts \
>   e2e/specs/communication-diffusion.spec.ts
> ```
>
> ### `communication-diffusion.spec.ts` — même sélecteur, aucun risque de mutation
>
> Ce spec sélectionne lui aussi la **première ligne** d'une table partagée
> (abonnés de `/communication/nouvelle`, pas une facture) — même schéma
> superficiel que les deux specs ci-dessus, mais sans partager leur risque, et
> jamais mentionné dans l'avertissement d'origine (angle mort documentaire).
> Vérifié dans le code backend avant d'écrire cette note : `CreerDiffusion`
> (`DiffusionService.creer_diffusion`, `services/notification/notifications/
> services.py`) ne fait que **lire** l'abonné ciblé (résolution du téléphone
> via un appel gRPC à Abonné Service) puis écrit exclusivement ses propres
> lignes `Diffusion`/`DiffusionEnvoi`, indépendantes d'une exécution à
> l'autre — jamais un champ de l'abonné lui-même. `traiter_lot_en_attente`
> (l'envoi de fond) ne touche ensuite que ses propres `DiffusionEnvoi`. Deux
> workers qui sélectionnent le même abonné créent donc chacun leur propre
> diffusion indépendante, sans jamais se marcher dessus : aucune ligne
> partagée n'est jamais modifiée par deux tests à la fois. Confirmé par les
> lancers parallèles répétés ci-dessus (aucune réécriture nécessaire).

```bash
E2E_ADMIN_USER=demo_admin E2E_ADMIN_PASSWORD='Demo1234!' \
E2E_COMPTABLE_USER=demo_comptable E2E_COMPTABLE_PASSWORD='Demo1234!' \
E2E_LIVE_BACKEND=1 \
npx playwright test --workers=1 \
  e2e/specs/abonnes-resiliation.spec.ts \
  e2e/specs/abonnes-remplacement-compteur.spec.ts \
  e2e/specs/campagnes-correction-releve.spec.ts \
  e2e/specs/paiements-annulation.spec.ts \
  e2e/specs/communication-diffusion.spec.ts \
  e2e/specs/facturation-envoi-whatsapp.spec.ts \
  e2e/specs/utilisateurs-creation.spec.ts \
  e2e/specs/rapports-export.spec.ts \
  e2e/specs/configuration-parametres.spec.ts \
  e2e/specs/profil-reset-password.spec.ts \
  e2e/specs/notifications-marquer-lu.spec.ts
```

| Spec | Rôle | Écrit | Backend WhatsApp requis ? |
|---|---|---|---|
| `abonnes-resiliation.spec.ts` | `ADMIN` | crée + résilie un abonné jetable | Non |
| `abonnes-remplacement-compteur.spec.ts` | `ADMIN` | crée un abonné + remplace son compteur | Non |
| `campagnes-correction-releve.spec.ts` | `ADMIN` | crée campagne + abonné + relevé (API), corrige (UI) | Non |
| `paiements-annulation.spec.ts` | ADMIN (fixture) + `COMPTABLE` (geste testé) | crée campagne + abonné + relevé + facture (API), enregistre + annule un paiement (UI) | **Oui** (reçu + relance) |
| `communication-diffusion.spec.ts` | `ADMIN` | crée une diffusion réelle (abonné du jeu partagé, sans risque — voir note ci-dessus) | **Oui** |
| `facturation-envoi-whatsapp.spec.ts` | ADMIN (fixture) + `COMPTABLE` (geste testé) | crée campagne + abonné + relevé + facture (API), déclenche l'envoi WhatsApp (UI) | **Oui** |
| `utilisateurs-creation.spec.ts` | `ADMIN` | crée un compte AGENT + le désactive | **Oui** (⚠️ voir limite connue) |
| `rapports-export.spec.ts` | `COMPTABLE` | télécharge un PDF (aucune mutation) | Non |
| `configuration-parametres.spec.ts` | `ADMIN` | modifie puis restaure un paramètre | Non |
| `profil-reset-password.spec.ts` | `ADMIN` | déclenche un envoi d'e-mail (jamais le mot de passe) | Non (mais e-mail réel, voir plus bas) |
| `notifications-marquer-lu.spec.ts` | `COMPTABLE` | marque des notifications lues (`localStorage` seul) | Non |

### Variables d'environnement supplémentaires

Aucune nouvelle variable — ces onze specs réutilisent `E2E_ADMIN_USER`/
`E2E_ADMIN_PASSWORD`/`E2E_COMPTABLE_USER`/`E2E_COMPTABLE_PASSWORD`, déjà
documentées plus haut. Aucune ne dépend de `E2E_ABONNE_RECHERCHE` ni d'un
abonné/campagne particulier — voir la remarque sur les fixtures jetables
ci-dessus.

### Alternative au garde-fou `WHATSAPP_DISABLE_SEND_FOR_TESTS` : arrêter `whatsapp-service`

Poser la variable d'environnement sur `notification-service` demande de
modifier `docker-compose.yml` ou de relancer le service avec
`docker compose run -e ...` (voir la section dédiée à
`paiement-encaissement.spec.ts` ci-dessus) — pas toujours possible sans
toucher au fichier de composition ou aux secrets déjà chargés dans
l'environnement (`.env`).

**Une alternative strictement équivalente, vérifiée dans le code des DEUX
côtés avant d'être utilisée** : arrêter le conteneur `whatsapp-service`
lui-même pour la durée du run (`docker compose stop whatsapp-service`, puis
`docker compose start whatsapp-service` une fois terminé). Sans ce conteneur
joignable, chaque appel HTTP `POST .../send` lève une erreur de connexion —
exactement le même type d'échec (`WhatsAppDeliveryError`) que celui que le
garde-fou logiciel court-circuite.

Vérifié service par service avant d'écrire les specs listés « Non » requis
WhatsApp ci-dessus, et pour les trois qui dégradent gracieusement :
- `EnregistrerPaiement`/`AnnulerPaiement` (`services/paiement/paiements/
  grpc_clients.py::envoyer_recu`/`envoyer_relance`) : `try/except` dédié,
  échec journalisé, **jamais remonté à l'appelant**.
- `EnvoyerFacture`/`RenvoyerFacture` (`services/notification/notifications/
  grpc_server.py`) : « retourne un `EnvoiResponse` ECHEC sans lever d'erreur
  gRPC (dégradation gracieuse) », d'après le docstring du handler lui-même.
- `CreerDiffusion` → `diffusion_processor_job` (`services/notification/
  notifications/services.py::traiter_lot_en_attente`) : capture
  `WhatsAppDeliveryError` PAR LIGNE, marque `ECHEC`, ne bloque jamais les
  autres lignes ni la clôture de la diffusion.

**⚠️ Exception vérifiée, qui casse cette équivalence : `CreateUser`.**
`services/auth/comptes/services.py::UserAdminService.create_user` appelle
`phone_otp.send_otp()` **sans aucun `try/except`** pour les rôles non-ADMIN.
Arrêter `whatsapp-service` fait donc échouer **tout le RPC `CreateUser`**,
alors que le compte est déjà committé en base (`isActive: false`, orphelin) —
voir le commentaire d'en-tête de `utilisateurs-creation.spec.ts` pour le
détail complet, avec les chemins de code exacts. Ce spec exige donc que
`whatsapp-service` tourne réellement (pas de garde-fou possible côté
frontend) ; il crée volontairement un rôle `AGENT` avec un numéro de
téléphone fabriqué (jamais un numéro réel) comme seule protection contre un
envoi réel.

### ⚠️ État constaté du jeu de données au 09/09/2026 — le seed documenté plus haut ne correspond plus à la stack en place

Avant d'écrire ces specs, l'état réel de la stack partagée a été vérifié par
requêtes GraphQL directes (pas supposé) : les abonnés `AB-9001` à `AB-9006`
et la campagne `Démo Delta` décrits dans `scripts/seed/README.md` (dépôt
`SGFE-backend`) **n'existent plus** — le parc actuel va de `AB-0001` à
`AB-0019` (numérotation de création organique, pas le préfixe réservé
`AB-90xx` d'un seed `uuid5`), et les 3 campagnes existantes sont toutes
`CLOTUREE` (aucune `EN_COURS`). En l'état, `terrain-saisie-index.spec.ts` et
la valeur `E2E_ABONNE_RECHERCHE=AB-9003` documentée pour
`abonnes-gestion.spec.ts` échoueraient si lancés tels quels contre cette
stack précise — pas un défaut de ces specs, un désalignement entre le seed
documenté et les données réellement présentes aujourd'hui. Un `bash
scripts/seed_demo.sh` (dépôt `SGFE-backend`) réaligne les deux, mais n'a
délibérément **pas** été relancé dans le cadre de cette itération (voir le
rapport de session). Les onze specs ci-dessus contournent ce problème par
construction (fixtures jetables, voir plus haut) et ont toutes été vérifiées
contre cette stack telle quelle.

## Ce qui est couvert aujourd'hui, et ce qui ne l'est toujours pas

Couvert : connexion (build/routage/traductions), espace abonné public (3
régimes de dette, token invalide — CI, sans backend), saisie d'index terrain,
enregistrement d'un paiement (avec garde-fou WhatsApp), consultation du
dashboard par rôle (ADMIN/COMPTABLE), l'entrée de la gestion des abonnés
(liste, recherche, fiche détail), et depuis le 09/09/2026 : résiliation d'un
abonné, remplacement d'un compteur, correction d'un relevé de campagne,
annulation d'un paiement, diffusion WhatsApp, envoi d'une facture par
WhatsApp, création/désactivation d'un utilisateur, export d'un rapport,
modification d'un paramètre de configuration, demande de réinitialisation de
mot de passe, et le centre de notifications. Un module par ancien « zéro
couverture » de l'audit a maintenant au moins un parcours d'écriture vérifié,
à l'exception de Communication (déjà couvert par `communication-diffusion.spec.ts`,
qui EST le module).

Pas encore couvert (hors périmètre de cette itération, honnêtement) :

- La création/clôture d'une campagne par l'UI elle-même (le nouveau
  `campagnes-correction-releve.spec.ts` crée sa campagne par API, pas par le
  formulaire `/campagnes/nouvelle`), ni l'affectation d'agents/zones.
- `AnnulerFacture`/`RegenererFacture` (écartés au profit de l'envoi WhatsApp,
  non réversibles dans le même test — voir l'en-tête de
  `facturation-envoi-whatsapp.spec.ts`) et la génération de factures en masse.
- Les impayés et le cycle de relance automatique (cron `ImpayeCheckerJob`).
- Les vues SUPERVISEUR (dashboard et campagnes filtrées par `createdBy`).
- La PWA (mode hors-ligne réel, installation, notifications push).
- La livraison WhatsApp réelle elle-même (contenu du message reçu sur un
  téléphone) : tous les specs WhatsApp de cette itération vérifient le
  mécanisme UI/GraphQL et la dégradation gracieuse, jamais la réception —
  voir « Specs ajoutées le 09/09/2026 » ci-dessus.

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
│   ├── abonnes-gestion.spec.ts         # hors gate CI — backend requis, lecture seule
│   ├── abonnes-resiliation.spec.ts             # hors gate CI — backend requis, fixture jetable
│   ├── abonnes-remplacement-compteur.spec.ts   # hors gate CI — backend requis, fixture jetable
│   ├── campagnes-correction-releve.spec.ts     # hors gate CI — backend requis, fixture par API
│   ├── paiements-annulation.spec.ts            # hors gate CI — garde-fou WhatsApp obligatoire
│   ├── communication-diffusion.spec.ts         # hors gate CI — garde-fou WhatsApp obligatoire
│   ├── facturation-envoi-whatsapp.spec.ts      # hors gate CI — garde-fou WhatsApp obligatoire
│   ├── utilisateurs-creation.spec.ts           # hors gate CI — WhatsApp requis, voir limite connue
│   ├── rapports-export.spec.ts                 # hors gate CI — backend requis, lecture + téléchargement
│   ├── configuration-parametres.spec.ts        # hors gate CI — backend requis, round-trip
│   ├── profil-reset-password.spec.ts           # hors gate CI — backend requis, e-mail réel
│   └── notifications-marquer-lu.spec.ts        # hors gate CI — backend requis (lecture), écriture locale
└── README.md              # ce fichier
```
