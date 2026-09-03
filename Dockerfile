# ── Stage 1 : Build ──────────────────────────────────────────────────────────
# node:22-alpine — résolu le 2026-09-02 (`docker pull node:22-alpine` +
# `docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine`).
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci --prefer-offline

COPY . .
RUN npx ng build --configuration production

# ── Stage 2 : Runtime (nginx) ─────────────────────────────────────────────────
# `nginx:1.27-alpine` n'a pas été reconstruite depuis avril 2025 : 6 CRITICAL,
# 29 HIGH, 49 MEDIUM connues (`docker scout quickview nginx:1.27-alpine`,
# 2026-09-02). `nginx:stable-alpine` (branche stable officielle, nginx/1.30.4,
# reconstruite le jour même) : 0 CRITICAL, 0 HIGH, 0 MEDIUM. On épingle celle-là
# plutôt que de figer la série 1.27.x vulnérable.
FROM nginx:stable-alpine@sha256:02b1b2a0445514891a14aa371845f6085d5d9d10d385b30d6aad606a50a29a05 AS runtime

# libcap : nécessaire à `setcap` ci-dessous (utilisateur non-root sur le port 80).
RUN apk add --no-cache curl libcap

# `--chown=nginx:nginx` : le script d'entrée de l'image (`docker-entrypoint.d/
# 10-listen-on-ipv6-by-default.sh`) réécrit `default.conf` en place à chaque
# démarrage pour y ajouter l'écoute IPv6 — il lui faut un fichier modifiable
# par l'utilisateur non-root sous lequel le conteneur tourne (voir USER
# ci-dessous), pas seulement lisible.
COPY --chown=nginx:nginx nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
# Fragments inclus par `default.conf`. Les oublier ici casse le démarrage de
# nginx (« open() ... failed ») — pas une dégradation silencieuse, au moins.
COPY nginx/api_proxy.conf nginx/security_headers.conf /etc/nginx/
COPY --from=builder --chown=nginx:nginx /app/dist/sgfe-frontend/browser /usr/share/nginx/html

# Vérifie la configuration à la CONSTRUCTION, pas au premier démarrage en
# production. `nginx -t` charge `default.conf` et ses includes ; une faute de
# syntaxe ou un fragment manquant fait échouer le build de l'image.
#
# Le `resolver` interne à Docker (127.0.0.11) n'existe pas pendant le build, mais
# `nginx -t` ne résout aucun amont : l'amont est une variable, précisément pour
# que rien ne soit résolu au chargement de la configuration.
RUN nginx -t

# ── Non-root ───────────────────────────────────────────────────────────────
#
# L'image officielle définit déjà l'utilisateur `nginx` (uid/gid 101) : on le
# réutilise plutôt que d'en créer un.
#
# Le port exposé (80, voir docker-compose*.yml et nginx-lb.conf.tpl qui
# attendent tous les trois ce port précis pour ce conteneur) reste <1024,
# donc hors de portée d'un utilisateur non-root sans `CAP_NET_BIND_SERVICE`.
# `setcap` sur le binaire nginx accorde exactement cette capacité, sans
# changer le port exposé ni toucher aux trois fichiers qui le référencent.
#
# `/var/cache/nginx` (buffers disque du proxy) et `/run` (fichier pid) sont
# root:root dans l'image de base : le process nginx (démarré non-root) doit
# pouvoir y écrire. `/var/log/nginx/{access,error}.log` sont déjà des liens
# vers /dev/stdout et /dev/stderr — universellement inscriptibles, rien à
# changer là.
RUN setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx \
  && mkdir -p /var/cache/nginx \
  && chown -R nginx:nginx /var/cache/nginx /run

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost/health || exit 1
