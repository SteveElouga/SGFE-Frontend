import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Test de charge basique — POINT DE DÉPART, PAS un vrai test de charge de
 * production. Voir loadtest/README.md pour ce que ça veut dire concrètement
 * et ce qui manque avant d'en tirer une conclusion de capacité.
 *
 * Exerce trois lectures GraphQL représentatives et peu coûteuses à raisonner
 * (pas de mutation, pas d'effet de bord) contre un backend SGFE-backend
 * tournant localement :
 *   - `login`      — pour obtenir un accessToken (les deux requêtes
 *                    suivantes sont protégées par rôle, voir CLAUDE.md du
 *                    backend § Rôles et permissions).
 *   - `abonnes`    — réservé ADMIN.
 *   - `campagnes`  — ADMIN / SUPERVISEUR / AGENT.
 * Utiliser un compte ADMIN pour que les deux passent.
 *
 * Usage :
 *   BASE_URL=http://localhost:8080 \
 *   K6_USER=... K6_PASSWORD=... \
 *   k6 run loadtest/basic.js
 *
 * Réglages optionnels : K6_VUS (défaut 2), K6_DURATION (défaut 30s).
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const IDENTIFIER = __ENV.K6_USER;
const PASSWORD = __ENV.K6_PASSWORD;

export const options = {
  vus: Number(__ENV.K6_VUS) || 2,
  duration: __ENV.K6_DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const LOGIN_QUERY = `
  mutation Login($identifier: String!, $password: String!) {
    login(identifier: $identifier, password: $password) {
      accessToken
      expiresIn
    }
  }
`;

// Même sélection que `GET_ABONNES` (src/app/graphql/queries/abonnes.queries.ts),
// sans le filtre optionnel `$statut`.
const GET_ABONNES_QUERY = `
  query GetAbonnes {
    abonnes {
      id
      numeroAbonne
      nom
      prenom
      statut
    }
  }
`;

// Même sélection que `GET_CAMPAGNES` (src/app/graphql/queries/campagnes.queries.ts).
const GET_CAMPAGNES_QUERY = `
  query GetCampagnes {
    campagnes {
      campagneId
      nom
      statut
      periodeMois
      periodeAnnee
    }
  }
`;

function graphql(token, query, variables) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return http.post(`${BASE_URL}/graphql`, JSON.stringify({ query, variables }), { headers });
}

function hasGraphqlErrors(res) {
  try {
    const body = JSON.parse(res.body);
    return Array.isArray(body.errors) && body.errors.length > 0;
  } catch {
    return true;
  }
}

/** Exécuté une seule fois avant le run : une session, réutilisée par tous les VUs. */
export function setup() {
  if (!IDENTIFIER || !PASSWORD) {
    throw new Error(
      'K6_USER / K6_PASSWORD requis (compte ADMIN — voir loadtest/README.md).',
    );
  }
  const res = graphql(null, LOGIN_QUERY, { identifier: IDENTIFIER, password: PASSWORD });
  const ok = check(res, {
    'login → 200': (r) => r.status === 200,
    'login → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });
  if (!ok) {
    throw new Error(`Échec du login (${res.status}) : ${res.body}`);
  }
  const token = JSON.parse(res.body).data.login.accessToken;
  return { token };
}

export default function (data) {
  const abonnesRes = graphql(data.token, GET_ABONNES_QUERY);
  check(abonnesRes, {
    'abonnes → 200': (r) => r.status === 200,
    'abonnes → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  const campagnesRes = graphql(data.token, GET_CAMPAGNES_QUERY);
  check(campagnesRes, {
    'campagnes → 200': (r) => r.status === 200,
    'campagnes → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  sleep(1);
}
