# ── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npx ng build --configuration production

# ── Stage 2 : Runtime (nginx) ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl

COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/sgfe-frontend/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost/health || exit 1
