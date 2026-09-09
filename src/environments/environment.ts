export const environment = {
  production: false,
  graphqlUrl: '/graphql',
  appName: 'Facturation Eau',
  // Sert de `release` Faro/GlitchTip (observabilité, phase 3) — figé à la
  // version de package.json faute de mécanisme d'injection du SHA de build
  // pour le frontend (contrairement aux images Docker backend, taguées par
  // commit). N'identifie donc pas un déploiement précis tant que ce champ
  // n'est jamais bumpé.
  appVersion: '0.0.0',
  // Point de départ du calcul d'itinéraire (écran Carte, § Itinéraire).
  // Constante en dur, documentée comme telle : pas de champ de configuration
  // en base pour l'instant (décision actée dans la mission). Coordonnées du
  // bureau/dépôt de l'exploitant — à remplacer par une vraie valeur de
  // configuration si un second point de départ (agence, garage…) devient
  // nécessaire.
  origineItineraire: { lat: 4.0511, lon: 9.7679 }, // Douala, Cameroun (repère par défaut)
  // DSN du projet GlitchTip (organisation "SGFE", plateforme d'observabilité
  // externe — voir CLAUDE.md § Observabilité). Dégradation gracieuse si vide,
  // même esprit que PYROSCOPE_SERVER_ADDRESS côté backend — les erreurs
  // restent captées par Faro (-> Loki) quoi qu'il arrive, GlitchTip est un
  // second exportateur optionnel, jamais une condition de démarrage.
  //
  // Hôte corrigé par rapport au DSN affiché par GlitchTip lui-même : sa
  // config (`GLITCHTIP_DOMAIN`, docker-compose.yml de la plateforme
  // d'observabilité) est restée sur le placeholder documenté
  // "glitchtip.example.com" (jamais adapté), donc le DSN généré pointe vers
  // un domaine qui n'existe pas. `localhost:8000` est l'hôte réellement
  // publié par cette pile de labo (confirmé : `docker ps` mappe
  // `observability-glitchtip-1` en `0.0.0.0:8000->8080/tcp`). Uniquement
  // valable en développement local sur cette même machine — voir
  // environment.prod.ts, resté vide tant qu'un vrai domaine de production
  // n'existe pas pour cette plateforme.
  glitchtipDsn: 'http://cf31fd3c1dc743beb1ff28692686b71f@localhost:8000/1',
};
