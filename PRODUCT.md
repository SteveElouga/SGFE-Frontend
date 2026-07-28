# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **AGENT (terrain)** — l'utilisateur critique. Agent de relevé sur smartphone 5 pouces (320–390 px), en tournée, réseau souvent instable. Son travail : saisir le nouvel index du compteur de chaque abonné de sa tournée en 3 interactions maximum, avec feedback immédiat, y compris hors ligne (file offline + auto-sync).
- **ADMIN** — back-office, accès total : abonnés, compteurs, campagnes, utilisateurs, facturation, paiements, configuration.
- **COMPTABLE** — factures, paiements, impayés/relances, dashboard.
- **SUPERVISEUR** — ses propres campagnes uniquement (filtrage `created_by`).
- **Abonné** (audience indirecte) — reçoit sa facture par WhatsApp et consulte l'espace abonné public via lien tokenisé, sans authentification.

## Product Purpose

SGFE (Système de Gestion de Facturation d'Eau) digitalise de bout en bout la facturation d'eau d'un opérateur : abonnés & compteurs → campagnes de relevé → saisie d'index terrain → facturation PDF (tarif au m³) → notification WhatsApp → paiement (espèces / Mobile Money / virement) → impayés & relances → suspension/réactivation → reporting. Succès = un cycle de facturation complet sans papier, des montants exacts, des impayés suivis et relancés automatiquement.

## Positioning

Déploiement **single-tenant pour un opérateur d'eau précis** (confirmé à l'init, 2026-07-28), pas un produit multi-opérateurs. Sa différence : une chaîne complète relevé → facture → WhatsApp → paiement adaptée aux réalités locales (FCFA, Mobile Money, WhatsApp comme canal principal, réseau instable sur le terrain, saisie offline-first) — là où un ERP générique ne suit pas.

## Operating Context

- Tournées de relevé sur smartphones d'entrée de gamme ; back-office (ADMIN/COMPTABLE) sur desktop.
- Montants en FCFA ; paiements espèces / Mobile Money / virement (référence obligatoire pour Mobile Money et virement). Mode CHÈQUE non supporté (retiré).
- WhatsApp est le canal de notification : envoi des factures et des liens tokenisés vers l'espace abonné.
- Langue de travail : français ; interface bilingue fr/en (ngx-translate).
- Les infos société (nom, coordonnées) sont paramétrées via le service config et figurent sur les factures.

## Capabilities and Constraints

- Le frontend parle **exclusivement** à la gateway GraphQL via le chemin relatif `/graphql` (same-origin, cookie refresh `SameSite=Strict`). RBAC appliqué à la gateway.
- Règles métier intangibles : `consommation = nouveau_index − ancien_index` (≥ 0) ; `montant = consommation × prix_m3` (prix copié dans la facture) ; `solde = montant − Σ versements` ; statuts facture `IMPAYEE | PARTIELLE | PAYEE` ; anti-surpaiement ; abonné ACTIF requis pour un relevé.
- Escalade impayés J+0/3/7/10 → suspension automatique → réactivation + WhatsApp au paiement du solde.
- Interface terrain : 3 taps maximum, clavier numérique pour l'index, offline-first (file persistée, UI optimiste).
- **Échelle confirmée : < 2 000 abonnés à court terme** (petite exploitation, quelques agents). Les choix d'interface privilégient la clarté et la vitesse, pas la machinerie « enterprise ».
- L'espace abonné public (`espace/:token`) est encore une coquille côté frontend — à construire.
- Non tranché : évolution éventuelle vers plusieurs zones/équipes si l'exploitation grandit.

## Brand Commitments

Aucun engagement durable (confirmé à l'init, 2026-07-28) : le nom « SGFE » et le logo actuel (`public/logo.svg`) peuvent évoluer librement. L'identité visible par l'abonné (factures, WhatsApp) porte le nom de l'opérateur, paramétré via le service config.

## Evidence on Hand

- `public/logo.svg`, icônes PWA (`public/icons`), manifest.
- i18n réel : `public/i18n` fr + en (~1 086 lignes chacun).
- `AUDIT_SGFE.md` (audit technique complet du 2026-07-17), `CONTEXT.md`, `MEMORY.md`, `docs/` (dépôt backend : SRS, ARCHITECTURE, ADR…).
- Aucun témoignage, client de référence, chiffre d'usage ou benchmark réel — ne jamais en fabriquer sur une surface de persuasion.

## Product Principles

1. **Le terrain d'abord.** L'interface agent prime sur tout : chaque changement s'évalue en nombre de taps, résilience hors-ligne et feedback immédiat.
2. **Exactitude financière visible.** Les montants sont exacts (Decimal côté backend) et affichés tels quels en FCFA ; l'UI n'arrondit ni n'approxime jamais l'argent, et les statuts (IMPAYEE/PARTIELLE/PAYEE) disent toujours la vérité.
3. **Sobriété à l'échelle réelle.** Pour < 2 000 abonnés, la clarté et la vitesse battent la complexité : pas de fonctionnalité-décor.
4. **Français d'abord, bilingue toujours.** Toute chaîne visible existe en fr et en ; le fr est la langue de référence.
5. **Un seul point d'entrée.** Tout passe par `/graphql` same-origin ; le frontend ne connaît aucun microservice.

## Accessibility & Inclusion

Inclusion des appareils modestes : smartphones d'entrée de gamme dès 320 px, réseau instable ou absent sur le terrain — la dégradation hors-ligne est une exigence produit, pas un bonus. `prefers-reduced-motion` est respecté.
