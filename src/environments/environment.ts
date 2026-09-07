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
};
