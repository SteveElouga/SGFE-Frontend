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
};
