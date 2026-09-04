import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Test de charge — POINT DE DÉPART OUTILLÉ, PAS un test de charge de
 * production. Voir loadtest/README.md pour ce que ça veut dire concrètement
 * et ce qui manque avant d'en tirer une conclusion de capacité — en
 * particulier : aucun environnement de staging n'existe pour rejouer ce
 * script dans des conditions représentatives, et ça reste vrai après cette
 * extension (hors périmètre de ce script).
 *
 * Profil de charge : montée progressive → palier stable → descente
 * (`executor: 'ramping-vus'`), plutôt qu'un nombre fixe de VUs pendant une
 * durée fixe comme avant. Un profil plat ne peut montrer que le comportement
 * en régime déjà établi ; un profil en paliers expose en plus ce qui ne se
 * voit qu'en charge croissante (ex. une dégradation qui apparaît en montant
 * vers un palier, pas une fois qu'on y est).
 *
 * Exerce six lectures GraphQL représentatives et peu coûteuses à raisonner
 * (pas de mutation, pas d'effet de bord sur une base partagée) contre un
 * backend SGFE-backend tournant localement :
 *   - `login`         — pour obtenir un accessToken (les requêtes suivantes
 *                       sont protégées par rôle, voir CLAUDE.md du backend
 *                       § Rôles et permissions).
 *   - `abonnes`       — réservé ADMIN (`gateway/schema/abonne_queries.py`).
 *   - `campagnes`     — ADMIN / SUPERVISEUR / AGENT (`campagne_queries.py`).
 *   - `impayes`       — ADMIN / COMPTABLE (`paiement_queries.py`) : liste des
 *                       factures impayées, un seul appel gRPC, sans argument.
 *   - `statsGlobales` — ADMIN / COMPTABLE (`reporting_queries.py`) : totaux
 *                       agrégés tous exercices, un seul appel gRPC (à ne pas
 *                       confondre avec `statsParMois`, volontairement exclue
 *                       ici : coûteuse, fan-out gRPC par campagne).
 *   - `configs`       — ADMIN uniquement (`config_queries.py`) : liste des
 *                       paramètres système, un seul appel gRPC.
 * Utiliser un compte ADMIN pour que les six passent (ADMIN a accès à tout,
 * voir CLAUDE.md backend § Rôles et permissions) — `impayes` et
 * `statsGlobales` sont aussi accessibles à un compte COMPTABLE si on veut un
 * jour vérifier ce périmètre plus étroit spécifiquement.
 *
 * Usage :
 *   BASE_URL=https://localhost:8443 \
 *   K6_USER=... K6_PASSWORD=... \
 *   k6 run --insecure-skip-tls-verify loadtest/basic.js
 *
 * `--insecure-skip-tls-verify` : le nginx local sert un certificat
 * auto-signé de dev (./scripts/generate-nginx-cert.sh côté backend) —
 * jamais à utiliser contre un environnement réel.
 *
 * Réglages optionnels du profil de charge — remplacent `K6_VUS`/`K6_DURATION`
 * (obsolètes : un profil en paliers n'a plus de VUs ni de durée uniques) :
 *   K6_VUS_CIBLE — nombre de VUs au palier stable (défaut : 5)
 *   K6_MONTEE    — durée de la montée, 0 → K6_VUS_CIBLE (défaut : '10s')
 *   K6_PALIER    — durée du palier stable à K6_VUS_CIBLE (défaut : '20s')
 *   K6_DESCENTE  — durée de la descente, K6_VUS_CIBLE → 0 (défaut : '10s')
 */

const BASE_URL = __ENV.BASE_URL || 'https://localhost:8443';
const IDENTIFIER = __ENV.K6_USER;
const PASSWORD = __ENV.K6_PASSWORD;

const VUS_CIBLE = Number(__ENV.K6_VUS_CIBLE) || 5;

export const options = {
  scenarios: {
    montee_palier_descente: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.K6_MONTEE || '10s', target: VUS_CIBLE },
        { duration: __ENV.K6_PALIER || '20s', target: VUS_CIBLE },
        { duration: __ENV.K6_DESCENTE || '10s', target: 0 },
      ],
      // Laisse une itération déjà commencée se terminer plutôt que la
      // couper net pendant la descente — sinon les derniers checks de la
      // descente échoueraient sur une requête interrompue, pas sur un vrai
      // problème de charge.
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // Seuil global conservé comme filet de sécurité...
    http_req_duration: ['p(95)<800'],
    // ... complété par un seuil par requête nommée (tag `name`, posé dans
    // `graphql()` ci-dessous) : une seule requête lente ne doit pas se
    // diluer dans la moyenne des six et passer inaperçue.
    'http_req_duration{name:login}': ['p(95)<800'],
    'http_req_duration{name:abonnes}': ['p(95)<800'],
    'http_req_duration{name:campagnes}': ['p(95)<800'],
    'http_req_duration{name:impayes}': ['p(95)<800'],
    'http_req_duration{name:statsGlobales}': ['p(95)<800'],
    'http_req_duration{name:configs}': ['p(95)<800'],
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

// Même sélection que `GET_IMPAYES` (src/app/graphql/queries/paiements.queries.ts).
// Sans argument côté schéma (`ListImpayesRequest` est vide) — un seul appel
// gRPC, pas de fan-out.
const GET_IMPAYES_QUERY = `
  query GetImpayes {
    impayes {
      factureId
      montantTotal
      montantPaye
      soldeRestant
      statut
      abonneId
      dateLimitePaiement
    }
  }
`;

// Même sélection que `GET_STATS_GLOBALES` (src/app/graphql/queries/stats.queries.ts).
// Pas `statsParMois` : celle-ci fait un fan-out gRPC par campagne côté
// gateway (`stats_queries.py`), donc pas « peu coûteuse à raisonner ».
const GET_STATS_GLOBALES_QUERY = `
  query GetStatsGlobales {
    statsGlobales {
      consommationTotaleGlobale
      montantTotalFactureGlobal
      montantTotalEncaisseGlobal
      historiqueCampagnes {
        campagneId
        nomCampagne
        totalAbonnes
        nbReleves
        pourcentageProgression
        consommationTotale
      }
    }
  }
`;

// Même sélection que `GET_CONFIGS` (src/app/graphql/queries/configuration.queries.ts).
const GET_CONFIGS_QUERY = `
  query GetConfigs {
    configs {
      cle
      valeur
      description
    }
  }
`;

function graphql(token, query, variables, name) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const params = { headers };
  // Tag `name` : permet aux thresholds par requête ci-dessus de cibler
  // chacune plutôt que de tout agréger sous l'URL unique `/graphql`.
  if (name) params.tags = { name };
  return http.post(`${BASE_URL}/graphql`, JSON.stringify({ query, variables }), params);
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
  const res = graphql(null, LOGIN_QUERY, { identifier: IDENTIFIER, password: PASSWORD }, 'login');
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
  const abonnesRes = graphql(data.token, GET_ABONNES_QUERY, undefined, 'abonnes');
  check(abonnesRes, {
    'abonnes → 200': (r) => r.status === 200,
    'abonnes → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  const campagnesRes = graphql(data.token, GET_CAMPAGNES_QUERY, undefined, 'campagnes');
  check(campagnesRes, {
    'campagnes → 200': (r) => r.status === 200,
    'campagnes → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  const impayesRes = graphql(data.token, GET_IMPAYES_QUERY, undefined, 'impayes');
  check(impayesRes, {
    'impayes → 200': (r) => r.status === 200,
    'impayes → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  const statsGlobalesRes = graphql(data.token, GET_STATS_GLOBALES_QUERY, undefined, 'statsGlobales');
  check(statsGlobalesRes, {
    'statsGlobales → 200': (r) => r.status === 200,
    'statsGlobales → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  const configsRes = graphql(data.token, GET_CONFIGS_QUERY, undefined, 'configs');
  check(configsRes, {
    'configs → 200': (r) => r.status === 200,
    'configs → sans erreur GraphQL': (r) => !hasGraphqlErrors(r),
  });

  sleep(1);
}
