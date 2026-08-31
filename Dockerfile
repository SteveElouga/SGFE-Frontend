# ── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci --prefer-offline

COPY . .
RUN npx ng build --configuration production

# ── Stage 2 : Runtime (nginx) ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl

COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
# Fragments inclus par `default.conf`. Les oublier ici casse le démarrage de
# nginx (« open() ... failed ») — pas une dégradation silencieuse, au moins.
COPY nginx/api_proxy.conf nginx/security_headers.conf /etc/nginx/
COPY --from=builder /app/dist/sgfe-frontend/browser /usr/share/nginx/html

# Vérifie la configuration à la CONSTRUCTION, pas au premier démarrage en
# production. `nginx -t` charge `default.conf` et ses includes ; une faute de
# syntaxe ou un fragment manquant fait échouer le build de l'image.
#
# Le `resolver` interne à Docker (127.0.0.11) n'existe pas pendant le build, mais
# `nginx -t` ne résout aucun amont : l'amont est une variable, précisément pour
# que rien ne soit résolu au chargement de la configuration.
RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost/health || exit 1
