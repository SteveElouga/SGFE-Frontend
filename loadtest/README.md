# Test de charge — point de départ

`basic.js` exerce trois requêtes GraphQL de lecture représentatives (`login`,
`abonnes`, `campagnes` — les moins coûteuses à raisonner de ce frontend)
contre un backend SGFE-backend tournant localement.

## Ce que ce n'est PAS

**Ce n'est pas un test de charge de production**, et il ne faut pas lui faire
dire plus qu'il ne mesure :

- Il tourne contre une machine de développeur, pas contre un environnement
  dimensionné comme la prod (CPU, mémoire, réseau, nombre de réplicas —
  aucun rapport avec ce que verrait un déploiement réel).
- **Il n'existe aujourd'hui aucun environnement de staging** pour rejouer ce
  script dans des conditions réalistes — pas de mensonge par omission ici :
  tant que cet environnement n'existe pas, aucun chiffre sorti de ce script
  (latence, débit soutenable) ne doit être cité comme une capacité du système
  en production.
- Il ne couvre que 2 lectures GraphQL sur une douzaine d'écrans. Aucune
  mutation, aucun scénario métier bout-en-bout, aucune montée en charge
  progressive (ramp-up/ramp-down), aucun profil réaliste de trafic (mix
  lecture/écriture, pics de fin de campagne, etc.).

Ce script sert de point de départ technique (comment interroger le GraphQL de
la Gateway sous k6, quelles requêtes sont sûres à rejouer) — pas de preuve de
capacité.

## Prérequis

- [k6](https://k6.io/) installé (`brew install k6`, ou voir leur doc).
- La stack `SGFE-backend` tournant en local via `docker compose` (dépôt
  séparé), servie en HTTPS sur `https://localhost:8443` (certificat
  auto-signé de dev — générer une fois `./scripts/generate-nginx-cert.sh`
  avant le premier démarrage, sans lui nginx refuse de démarrer).
- Un compte `ADMIN` valide : `abonnes` est réservé ADMIN, `campagnes` est
  accessible à ADMIN/SUPERVISEUR/AGENT (voir le `CLAUDE.md` du backend,
  § Rôles et permissions) — un compte ADMIN couvre les deux requêtes.

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

Réglages optionnels :
- `K6_VUS` — nombre d'utilisateurs virtuels (défaut : 2)
- `K6_DURATION` — durée du run (défaut : 30s)

Exemple pour un essai minimal (1 utilisateur virtuel, 10s) :

```bash
BASE_URL=https://localhost:8443 K6_USER=... K6_PASSWORD=... \
K6_VUS=1 K6_DURATION=10s k6 run --insecure-skip-tls-verify loadtest/basic.js
```
