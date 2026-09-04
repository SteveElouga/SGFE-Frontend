// Configuration ESLint minimale, dédiée à l'analyse de sécurité (SAST).
//
// Choix : eslint-plugin-security plutôt que Semgrep/CodeQL — voir le plan de
// remédiation `docs/CONFORMITE_CICD.md` (item 9, NIST PW.7, backend `bandit`
// équivalent). Ce dépôt n'a aujourd'hui AUCUN outillage ESLint (mesuré : aucun
// fichier `.eslintrc*`/`eslint.config.*` avant cette tâche) ; eslint-plugin-
// security est le point d'entrée le plus léger — une seule dépendance, pas de
// service externe, pas de compte à créer — pour combler un vrai vide plutôt
// que d'ajouter un outil plus lourd (Semgrep) sur un dépôt qui n'a même pas la
// brique de base. Semgrep reste une option pour aller plus loin plus tard.
//
// Scope : uniquement `src/**/*.ts`, en excluant les fichiers `*.spec.ts`. Les
// règles de ce plugin visent du code qui s'exécute en production face à une
// entrée non fiable (fichier lu depuis un chemin non contrôlé, regex sur une
// entrée utilisateur, etc.) — pas les scripts de test qui parcourent le dépôt
// lui-même au moment du `ng test`/`vitest` (ex. `schema-contrat.spec.ts` lit
// les fichiers `.ts` du dépôt pour vérifier les fragments GraphQL,
// `aquabill-preset.spec.ts` lit un fichier de thème local) : ces chemins sont
// toujours internes au dépôt, jamais une entrée d'un utilisateur final.
//
// `security/detect-object-injection` est désactivée : mesurée sur ce dépôt,
// elle représente 45 des 48 avertissements du jeu de règles recommandé sur
// `src/**/*.ts`, exclusivement des faux positifs (accès à une propriété par
// une clé calculée dans du TypeScript typé — le cas que cette règle ne sait
// pas distinguer d'une vraie injection). C'est un faux-positif documenté et
// largement reconnu de ce plugin sur les codebases TypeScript ; la désactiver
// plutôt que la couvrir de `eslint-disable` ligne par ligne évite le bruit qui
// masquerait un vrai signal. Toutes les autres règles recommandées restent
// actives à leur sévérité par défaut (`warn`), et l'étape CI échoue sur le
// moindre avertissement restant (`--max-warnings 0`).
import security from 'eslint-plugin-security';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: { security },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
    },
  },
];
