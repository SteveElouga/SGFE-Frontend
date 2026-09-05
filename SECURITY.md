# Politique de sécurité

## Versions supportées

Projet en développement actif, une seule ligne de développement (`develop` →
`main`). Seule la dernière version déployée en production est supportée ;
aucune branche de maintenance à long terme n'existe à ce jour.

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour une vulnérabilité de
sécurité. Ouvrez plutôt un
[signalement de sécurité privé](https://github.com/SteveElouga/SGFE-frontend/security/advisories/new)
via l'onglet Security de ce dépôt, ou contactez directement le mainteneur
(voir profil GitHub [@SteveElouga](https://github.com/SteveElouga)).

Merci d'inclure :
- une description du problème et de son impact potentiel ;
- les étapes pour le reproduire ;
- si possible, le fichier et la ligne concernés.

## Délai de réponse

Projet mono-développeur : le délai de réponse est **indicatif**, pas
contractuel. Objectif visé : premier accusé de réception sous 5 jours
ouvrés.

## Portée

Ce dépôt contient le frontend Angular du SGFE. Le pipeline CI applique déjà
un scan de dépendances (`npm audit`), une analyse statique de sécurité
(`eslint-plugin-security`) et un scan d'image Docker (Trivy) sur chaque
changement — voir `docs/CONFORMITE_CICD.md` pour l'état détaillé de ces
contrôles.
