export const environment = {
  production: true,
  graphqlUrl: '/graphql',
  appName: 'Facturation Eau',
  // Voir environment.ts — même réserve, figé faute de SHA de build injecté.
  appVersion: '0.0.0',
  // Voir environment.ts — même constante en dur, même réserve.
  origineItineraire: { lat: 4.0511, lon: 9.7679 },
  // Voir environment.ts — même dégradation gracieuse. Volontairement vide ici
  // aussi tant que le DSN réel n'est pas renseigné : mieux vaut un
  // déploiement de prod sans remontée GlitchTip qu'un DSN placeholder qui
  // enverrait de fausses erreurs vers un projet GlitchTip inexistant.
  glitchtipDsn: '',
};
