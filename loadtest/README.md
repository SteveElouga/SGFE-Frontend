# Test de charge — point de départ outillé

`basic.js` exerce six requêtes GraphQL de lecture représentatives (`login`,
`abonnes`, `campagnes`, `impayes`, `statsGlobales`, `configs` — des lectures
peu coûteuses à raisonner, sans mutation ni effet de bord) contre un backend
SGFE-backend tournant localement, avec un profil de charge en paliers
(montée progressive → palier stable → descente) plutôt qu'un nombre fixe de
VUs pendant une durée fixe.

## Ce que ce n'est PAS

**Ce n'est toujours pas un test de charge de production**, et il ne faut pas
lui faire dire plus qu'il ne mesure :

- Il tourne contre une machine de développeur, pas contre un environnement
  dimensionné comme la prod (CPU, mémoire, réseau, nombre de réplicas —
  aucun rapport avec ce que verrait un déploiement réel).
- **Il n'existe aujourd'hui aucun environnement de staging** pour rejouer ce
  script dans des conditions réalistes — pas de mensonge par omission ici :
  tant que cet environnement n'existe pas, aucun chiffre sorti de ce script
  (latence, débit soutenable) ne doit être cité comme une capacité du système
  en production. **Ce point n'a pas changé et n'est pas dans le périmètre de
  ce script** : un profil de charge plus réaliste et une couverture de
  lectures plus large ne remplacent pas un environnement représentatif.
- Il ne couvre que 6 lectures GraphQL sur une douzaine d'écrans. Aucune
  mutation, aucun scénario métier bout-en-bout (saisir un index, générer une
  facture, enregistrer un paiement…), aucun mix réaliste de trafic
  (proportion lecture/écriture, pics de fin de campagne, plusieurs rôles
  simultanés, etc.).

Ce script sert de point de départ technique (comment interroger le GraphQL de
la Gateway sous k6, quelles requêtes sont sûres à rejouer, quel profil de
charge leur appliquer) — pas de preuve de capacité.

## Profil de charge

`options.scenarios` utilise l'executor k6 `ramping-vus` avec trois paliers :

1. **Montée** — 0 → `K6_VUS_CIBLE` VUs, progressivement (défaut : 10s).
2. **Palier** — `K6_VUS_CIBLE` VUs maintenus (défaut : 20s).
3. **Descente** — `K6_VUS_CIBLE` → 0 VUs, progressivement (défaut : 10s).

C'est un profil de **test**, pas un chiffre de capacité de production : les
valeurs par défaut (5 VUs au palier) sont calibrées pour tourner sans
solliciter excessivement un poste de développeur, pas pour représenter une
charge réelle.

Chaque requête est taguée (`name`) pour que les seuils (`thresholds`) portent
sur elle individuellement plutôt que sur une moyenne globale qui noierait une
requête lente parmi les autres — un `p(95)<800` par requête en plus du seuil
global.

## Prérequis

- [k6](https://k6.io/) installé (`brew install k6`, ou voir leur doc).
- La stack `SGFE-backend` tournant en local via `docker compose` (dépôt
  séparé), servie en HTTPS sur `https://localhost:8443` (certificat
  auto-signé de dev — générer une fois `./scripts/generate-nginx-cert.sh`
  avant le premier démarrage, sans lui nginx refuse de démarrer).
- Un compte `ADMIN` valide (permet les six requêtes — ADMIN a accès à tout,
  voir le `CLAUDE.md` du backend, § Rôles et permissions) :
  - `abonnes` — réservé ADMIN.
  - `campagnes` — ADMIN / SUPERVISEUR / AGENT.
  - `impayes`, `statsGlobales` — ADMIN / COMPTABLE.
  - `configs` — réservé ADMIN.

**Avant de lancer quoi que ce soit contre une stack locale**, vérifier
`docker compose ps` dans le dépôt backend : si un autre agent ou une autre
session s'en sert déjà, ne pas la solliciter en plus sans coordination — même
un test « en lecture seule » ajoute de la charge sur un environnement partagé.

## Lancer

```bash
BASE_URL=https://localhost:8443 \
K6_USER=... K6_PASSWORD=... \
k6 run --insecure-skip-tls-verify loadtest/basic.js
```

`--insecure-skip-tls-verify` est nécessaire tant que le nginx local sert le
certificat auto-signé de dev — jamais utile ni sûr contre un environnement
réel.

Réglages optionnels du profil de charge (remplacent `K6_VUS`/`K6_DURATION`
des versions précédentes de ce script — un profil en paliers n'a plus de VUs
ni de durée uniques) :

- `K6_VUS_CIBLE` — nombre de VUs au palier stable (défaut : `5`)
- `K6_MONTEE` — durée de la montée en charge, 0 → `K6_VUS_CIBLE` (défaut : `10s`)
- `K6_PALIER` — durée du palier stable (défaut : `20s`)
- `K6_DESCENTE` — durée de la descente, `K6_VUS_CIBLE` → 0 (défaut : `10s`)

Exemple pour un essai minimal (2 VUs au palier, montée/descente 5s, palier 10s) :

```bash
BASE_URL=https://localhost:8443 K6_USER=... K6_PASSWORD=... \
K6_VUS_CIBLE=2 K6_MONTEE=5s K6_PALIER=10s K6_DESCENTE=5s \
k6 run --insecure-skip-tls-verify loadtest/basic.js
```
