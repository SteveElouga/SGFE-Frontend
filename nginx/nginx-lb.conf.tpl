# Template nginx load balancer pour déploiement Canary
# Variables injectées par envsubst : STABLE_WEIGHT, CANARY_WEIGHT
# Exemple : STABLE_WEIGHT=95 CANARY_WEIGHT=5

upstream frontend_pool {
    server frontend-stable:80 weight=${STABLE_WEIGHT};
    server frontend-canary:80 weight=${CANARY_WEIGHT};

    keepalive 32;
}

server {
    listen 80;
    server_name aquabill.cm www.aquabill.cm;

    # Redirection HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aquabill.cm www.aquabill.cm;

    ssl_certificate     /etc/letsencrypt/live/aquabill.cm/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aquabill.cm/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    # ── Health check ─────────────────────────────────────────────────────────
    location /health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # ── Routage canary ───────────────────────────────────────────────────────
    location / {
        proxy_pass         http://frontend_pool;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Sticky session optionnel (un même utilisateur reste sur la même version)
        # proxy_set_header   Cookie $http_cookie;
    }

    # ── Sécurité ─────────────────────────────────────────────────────────────
    add_header X-Frame-Options           DENY;
    add_header X-Content-Type-Options    nosniff;
    add_header X-XSS-Protection          "1; mode=block";
    add_header Referrer-Policy           "strict-origin-when-cross-origin";
    add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()";
}
