---
name: SGFE — Système de Gestion de Facturation d'Eau
description: Le Registre de Terrain, écrit dans un vocabulaire d'eau.
colors:
  bleu-riviere: "#1a56db"
  bleu-riviere-fonce: "#1d4ed8"
  bleu-riviere-clair: "#60a5fa"
  vert-nappe: "#0e9f6e"
  vert-profond: "#166534"
  vert-abysse: "#14532d"
  navy-nuit: "#0f1c3d"
  rouge-alerte: "#dc2626"
  rouge-brulure: "#b91c1c"
  ambre-attente: "#b45309"
  ambre-jaune: "#f59e0b"
  orange-attention: "#c2410c"
  orange-attention-clair: "#f97316"
  orange-lueur: "#fff7ed"
  orange-trait: "#fed7aa"
  ardoise-nuit: "#0f172a"
  ardoise-encre: "#475569"
  ardoise-brume: "#64748b"
  ardoise-pale: "#94a3b8"
  ardoise-crayon: "#cbd5e1"
  ardoise-trait: "#e2e8f0"
  ardoise-nappe: "#f1f5f9"
  ardoise-brise: "#f8fafc"
  blanc: "#ffffff"
  mint-lueur: "#f0fdf4"
  mint-trait: "#bbf7d0"
  mint-tapis: "#dcfce7"
  rose-lueur: "#fef2f2"
  rose-trait: "#fecaca"
  ambre-lueur: "#fffbeb"
  ambre-trait: "#fde68a"
  ambre-tapis: "#fef3c7"
  ciel-lueur: "#eff6ff"
  ciel-trait: "#bfdbfe"
typography:
  display:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "42px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  metric-xl:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  metric-lg:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1
  metric-md:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
  kpi-value:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
  metric-sm:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
  page-title:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
  subtitle:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  body-strong:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  icon-lg:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1
  icon-md:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1
  body:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.05em"
  micro:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  mini: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xl2: "14px"
  sheet: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.bleu-riviere}"
    textColor: "{colors.blanc}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "14px 22px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.bleu-riviere-fonce}"
    textColor: "{colors.blanc}"
  button-success:
    backgroundColor: "{colors.vert-profond}"
    textColor: "{colors.blanc}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "14px 22px"
    height: "50px"
  button-ghost:
    backgroundColor: "{colors.blanc}"
    textColor: "{colors.ardoise-encre}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "42px"
  button-dark:
    backgroundColor: "{colors.navy-nuit}"
    textColor: "{colors.blanc}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-danger-outline:
    backgroundColor: "{colors.rose-lueur}"
    textColor: "{colors.rouge-alerte}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "10px 14px"
    height: "42px"
  input-field:
    backgroundColor: "{colors.ardoise-brise}"
    textColor: "{colors.ardoise-nuit}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "13px 14px"
  card:
    backgroundColor: "{colors.blanc}"
    textColor: "{colors.ardoise-nuit}"
    rounded: "{rounded.xl}"
    padding: "20px"
  badge-success:
    backgroundColor: "{colors.mint-lueur}"
    textColor: "{colors.vert-profond}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  chip-filter:
    backgroundColor: "{colors.ardoise-brise}"
    textColor: "{colors.ardoise-encre}"
    typography: "{typography.body}"
    fontWeight: 500
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "34px"
  chip-filter-active:
    backgroundColor: "{colors.navy-nuit}"
    textColor: "{colors.blanc}"
    typography: "{typography.body}"
    fontWeight: 600
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "34px"
  chip-filter-empty:
    backgroundColor: "{colors.ardoise-brise}"
    textColor: "{colors.ardoise-brume}"
    typography: "{typography.body}"
    fontWeight: 500
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "34px"
---

# Design System: SGFE — Système de Gestion de Facturation d'Eau

## Overview

**Creative North Star: "Le Registre de Terrain"**

SGFE se lit comme un cahier de régie d'eau bien tenu — colonnes propres, chiffres exacts, un tampon vert quand le relevé passe — mais un cahier qui a fait la tournée dans la poche d'un agent, sur un 320 px, sous 4G bancale. C'est la rencontre de deux exigences : la précision d'un formulaire administratif et la robustesse d'une interface de terrain. Le vocabulaire chromatique est aquatique (Bleu Rivière, Vert Nappe, Navy Nuit), mais la grammaire visuelle est celle d'un registre : cartes plates, bordures fines, gros chiffres pour ce qui pèse (m³, FCFA), une seule couleur d'accent réservée à ce que l'app *confirme* (paiement acté, relevé pris).

Le mobile n'est pas une adaptation — c'est la référence. Chaque écran s'ouvre sur une bande navy `#0f1c3d` qui ancre l'app, puis descend en cartes blanches sur fond Ardoise Nappe. Le desktop hérite du même vocabulaire (mêmes cartes, mêmes bordures) sans la bande navy. La sensation visée est *sobre pour la lecture, tactile là où l'agent appuie* — jamais l'inverse.

L'app refuse explicitement deux esthétiques : le dashboard SaaS enterprise (indigo triste, chart-junk, 15 items de sidebar pour < 2 000 abonnés) et la fintech grand public (dégradés partout, illustrations 3D, gamification). SGFE gère de l'eau et de l'argent réels ; le vernis desservirait la confiance.

**Key Characteristics:**
- Trois couleurs signature portent tout : Bleu Rivière `#1a56db`, Vert Nappe `#0e9f6e`, Navy Nuit `#0f1c3d`.
- Montserrat 300→800, une seule famille ; le poids 800 est réservé aux chiffres qui pèsent.
- Mobile-first : bande navy en tête, bottom-tabs fixes, sidebar en tiroir, bottom-sheet gestuel.
- Cartes plates + bordure 1px au repos ; le relief coloré n'apparaît que sur l'action (CTA) ou la couche portée (sheet, toast).
- Statut jamais transmis par la couleur seule — toujours texte MAJUSCULES + fond teinté + bordure 1px de la même famille.
- `prefers-reduced-motion` respecté partout ; press-scale 0.97 universel sur `.btn`.

## Colors

Palette aquatique : trois teintes signature racontent l'app (eau, argent, structure), une échelle d'ardoise porte le silence entre les accents, et des triplets teintés dessinent chaque statut.

### Primary
- **Bleu Rivière** (`#1a56db`) : la couleur du geste actif — bouton primaire, lien, focus, ligne "en cours". Elle ne décore jamais ; elle indique une action ou une sélection.
- **Bleu Rivière Foncé** (`#1d4ed8`) : la même, en survol ou en gradient. Jamais utilisée seule pour du texte.
- **Bleu Rivière Clair** (`#60a5fa`) : uniquement en fin de gradient de progression ou en surlignage dans le sidebar (carte campagne).

### Secondary
- **Vert Nappe** (`#0e9f6e`) : la couleur de ce que l'app *confirme* — logo (goutte), paiement acté, relevé pris, KPI positif. Elle apparaît uniquement en réponse à une réussite ; jamais comme fond de section.
- **Vert Profond** (`#166534`) / **Vert Abysse** (`#14532d`) : tons de profondeur pour l'écran de succès terrain et les gradients de validation.

### Tertiary
- **Navy Nuit** (`#0f1c3d`) : la couleur structurelle — sidebar desktop, bande topbar mobile, header terrain, chip actif de filtre, bouton "dark", toast mobile. C'est le fond sur lequel l'app se tient debout.

### Neutral
- **Ardoise Nuit** (`#0f172a`) : titres, chiffres, tout texte primaire sur surface claire.
- **Ardoise Encre** (`#475569`) : texte secondaire, bouton fantôme, chef de colonne.
- **Ardoise Brume** (`#64748b`) : étiquette, sous-titre, méta.
- **Ardoise Pâle** (`#94a3b8`) : placeholder, hint, mention silencieuse.
- **Ardoise Crayon** (`#cbd5e1`) : chevron désactivé, séparateur pâle, placeholder de champ vide.
- **Ardoise Trait** (`#e2e8f0`) : bordure par défaut de toute carte, entrée, filtre au repos.
- **Ardoise Nappe** (`#f1f5f9`) : fond du contenu (derrière les cartes).
- **Ardoise Brise** (`#f8fafc`) : fond de champ, ligne alternée de table, chip inactive.
- **Blanc** (`#ffffff`) : surface de carte, dialogue, sheet.

### Signal (état, pas décoration)
- **Rouge Alerte** (`#dc2626`) + fond **Rose Lueur** (`#fef2f2`) + bordure **Rose Trait** (`#fecaca`) : impayé, suspension, erreur, `non_releve`, tab dot.
- **Ambre Attente** (`#b45309`) + fond **Ambre Lueur** (`#fffbeb`) + bordure **Ambre Trait** (`#fde68a`) : sync en attente, hors ligne, réactivation, bandeau de dégradation.
- **Mint Lueur** (`#f0fdf4`) + **Mint Trait** (`#bbf7d0`) + texte **Vert Profond** (`#15803d`) : payé, relevé pris, succès.
- **Ciel Lueur** (`#eff6ff`) + **Ciel Trait** (`#bfdbfe`) + texte **Bleu Rivière Foncé** (`#1d4ed8`) : Mobile Money, info, montant partiel.

### Named Rules

**La Règle du Vert Rare.** Le Vert Nappe n'est jamais décoratif. Il apparaît uniquement quand quelque chose *devient vrai* : un paiement acté, un relevé pris, un succès confirmé. Le voir dans un empty state, un onboarding ou un placeholder est un bug.

**La Règle du Navy Ancrant.** Le Navy Nuit est *toujours* la bande qui structure l'écran (topbar mobile, sidebar desktop, chip actif) — jamais un accent ponctuel. Il n'est pas la couleur d'un bouton primaire (rôle du Bleu Rivière) ni d'un état d'alerte (rôle du Rouge Alerte).

**La Règle de la Triplette Teintée.** Aucun statut n'est jamais dit par la couleur seule. Chaque statut est un triplet : fond teinté clair + bordure 1px de la même famille + texte foncé de la même famille + libellé en MAJUSCULES avec letter-spacing 0.03–0.05em. La couleur ne remplace jamais le mot, elle l'accompagne.

## Typography

**Display Font :** Montserrat (fallback `sans-serif`), poids 300 à 800 chargés via Google Fonts (`preload` + `display=swap`).
**Body Font :** Montserrat (même famille pour tout).
**Label/Mono Font :** JetBrains Mono / Cascadia Code / Courier New — usage rare, réservé aux colonnes techniques (id, uuid, code compteur) dans la configuration et le détail de campagne.

**Character :** Une seule famille de bout en bout, mais un contraste de poids extrême — 300 pour le titre brand de l'auth (accueil), 800 pour tout chiffre qui *pèse* (m³, FCFA, %). Le poids 500 tient le milieu (nav, boutons secondaires, meta). La sensation est celle d'un formulaire administratif dont on aurait choisi une belle grotesque contemporaine.

### Hierarchy
- **Display** (800, 42px, line-height 1) : le grand pourcentage du dashboard hero. Un par écran au maximum.
- **Headline** (700, 32px, line-height 1.2) : le H1 de l'écran d'auth ; premier écran vu par l'utilisateur.
- **Title** (700, 20px, line-height 1.15) : titre d'écran mobile (topbar navy), titre de carte (numéro de facture, "Résumé"), heading terrain.
- **Body** (400, 13px, line-height 1.5) : texte par défaut, description, corps de liste et de table.
- **Label** (600, 11px, letter-spacing 0.05em, MAJUSCULES) : étiquette de KPI, en-tête de colonne de table, badge de statut, surtitre navy.

### Named Rules

**La Règle du Chiffre Fort.** Le poids Montserrat 800 est réservé aux nombres qui portent un montant, une consommation ou une magnitude (%). Les tailles vont de 22px (KPI compact mobile) à 42px (hero dashboard). Un *titre* en 800 est une faute — le poids doit rester le vocabulaire des chiffres, pas des mots.

**La Règle des MAJUSCULES Comptées.** Les MAJUSCULES tracked-lettered sont réservées à trois usages : étiquettes de KPI, en-têtes de colonnes de table, badges de statut. Aucune autre section n'en porte. Le tracked-uppercase n'est pas une grammaire de section — c'est le geste d'un formulaire officiel, à ne pas diluer en eyebrow décoratif.

**La Règle de la Famille Unique.** Une seule police de bout en bout. Le monospace n'apparaît que pour des colonnes techniques (id, uuid) dans deux vues précises. Aucune serif, aucun display font — la variété vient du poids (300/400/500/600/700/800), jamais de la famille.

## Layout

Le layout est mobile-first et cartésien : une bande d'en-tête (navy sur mobile, blanche sur desktop), puis une pile de cartes sur fond Ardoise Nappe `#f1f5f9`.

**Container.** Le shell fait 100dvh, sidebar 220px (desktop) / 280px (mobile en tiroir), contenu défilant, `background: #eef2f7` derrière les cartes. Aucune largeur max globale : le desktop laisse respirer les tables. Le formulaire de saisie terrain plafonne à 480px et se centre.

**Rythme.** Les cartes s'empilent avec 12–16px entre elles ; à l'intérieur, le padding est 12–20px selon la densité. Pas de grille flex-box arbitraire — la verticalité domine, ponctuée par des lignes flex horizontales dans les cartes.

**Breakpoints.** Trois seuils portent tout, plus quelques points locaux :
- `320px` — mobile minimum, référence de conception (pas une exception).
- `640px` — compaction des chips.
- `720px` — bascule table → cartes empilées (`data-table [appCardRow]`).
- `768px` — bascule desktop/mobile (sidebar en tiroir, topbar navy, bottom-tabs affichées).
- `1024px` — bascule flex vertical → horizontal pour l'auth (panneau brand + formulaire côte à côte).

**Densité.** Deux densités par défaut, jamais mélangées dans la même vue :
- *Terrain* (agent, mobile) : boutons 50px, radius 12px, padding 12–16px, chiffres 30–34px. Le pouce prime.
- *Back-office* (admin/comptable, desktop) : lignes de table 13px, padding 10–16px, boutons 42px. La lecture prime.

**Safe area.** Les vues terrain intègrent `env(safe-area-inset-bottom)` pour la bottom-bar iOS : `padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px))`.

### Named Rules

**La Règle de la Bande Navy.** Chaque écran mobile s'ouvre sur une bande `#0f1c3d` pleine largeur (topbar + héro optionnel `[topbar-hero]` projeté). C'est la constante spatiale de l'app mobile — la retirer casse l'identité perçue.

**La Règle du 320.** Toute page doit être utilisable sur 320px sans scroll horizontal. Si un tableau ne rentre pas, il passe en cartes empilées via `[appCardRow]` — jamais en scroll horizontal exposé au doigt.

## Elevation & Depth

Le système est **structuré par couche** : chaque type de surface a son ombre nommée, du contact au flottant. La règle qui gouverne : *cartes plates au repos, relief coloré à l'action, ombre douce sur les couches portées*.

### Shadow Vocabulary
- **Ras** (`box-shadow: none` + `border: 1px solid #e2e8f0`) : KPI, carte de tableau, ligne, activité. La couche au repos ne s'élève pas — elle se dessine par sa bordure.
- **Levée** (`box-shadow: 0 4px 12px rgba(26, 86, 219, 0.3)`) : CTA primaire (page-topbar-action). Ombre teintée bleu — signale *le* geste principal.
- **Levée Terrain** (`box-shadow: 0 4px 14px rgba(26, 86, 219, 0.4)`) : CTA primaire terrain (button-primary large). Halo plus profond, adapté au doigt.
- **Levée Succès** (`box-shadow: 0 4px 14px rgba(22, 101, 52, 0.4)`) : CTA de validation (button-success). Ombre teintée vert — signale la confirmation.
- **Héro** (`box-shadow: 0 8px 24px rgba(26, 86, 219, 0.22)`) : carte dashboard-hero. Ombre teintée large sous le gradient signature.
- **Popover** (`box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)`) : menu utilisateur, popover portal. Deux ombres composées pour un rebord net.
- **Toast** (`box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12)`) : toast desktop success/info/warning.
- **Sheet Portable** (`box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.25)`) : bottom-sheet mobile levé du bas.
- **Tiroir Latéral** (`box-shadow: 4px 0 24px rgba(15, 23, 42, 0.25)`) : sidebar mobile en tiroir.
- **Bottom-tabs** (`box-shadow: 0 -4px 20px rgba(15, 37, 87, 0.06)`) : barre d'onglets fixe, ombre subtile teintée navy vers le haut.

### Named Rules

**La Règle du Plat au Repos.** Toute carte, tout KPI, toute cellule de table est plate au repos — bordure 1px + surface pleine, pas d'ombre. L'ombre est réservée à l'action (CTA) ou à la couche portée (sheet, toast, drawer).

**La Règle de l'Ombre Teintée.** Une ombre sous un CTA prend la teinte du CTA (bleu → rgba bleu, vert → rgba vert). Une ombre "grise neutre" sous un bouton coloré est une erreur — elle casse la lecture de la hiérarchie.

## Shapes

Le vocabulaire de forme est celui d'un formulaire imprimé passé au rayon-toucher : coins doux mais pas ronds, bordures fines 1px, aucune enveloppe organique.

**Radius scale.** Cinq familles :
- *Micro* : 2px (grip de sheet, cartes accolées iOS-style où plusieurs `.act-row` s'empilent en groupe avec radius 10px seulement en tête et pied).
- *Éléments serrés* : badge 6px, page-btn 6px, bouton compact 8px, input 8px, icône contexte 8px.
- *Cartes* : 10px (info-cell), 12px (KPI, table wrap, dialog desktop), 14px (carte mobile).
- *Couches portées* : 16px (dialog desktop), 24px (bottom-sheet mobile — coins hauts uniquement).
- *Formes rondes* : chip pill 999px, avatar 50%.

**Bordures.** Systématiquement 1px `#e2e8f0` (Ardoise Trait) pour les cartes au repos. Les inputs partagent la même bordure et gagnent 2px `#1a56db` (Bleu Rivière) au focus. Les états d'alerte remplacent la bordure par la teinte de la famille (rose, ambre, mint) — jamais un liseré coloré épais.

**Silhouettes récurrentes.**
- *Barre de progression* : 5–8px de haut, 3–4px de radius, fond teinté 15% opacity, remplissage plein. Apparaît sur le hero dashboard, la carte campagne sidebar, le header terrain.
- *Grip de sheet* : rectangle 40×4px, radius 2px, `#e2e8f0`. Signature mobile — jamais desktop.
- *Avatar gradient* : cercle 32px, gradient 135° bleu→vert, initiale blanche 600. Réservé à l'utilisateur courant (sidebar footer).
- *Goutte* : le logo est une goutte verte pleine avec une seconde goutte blanche imbriquée. La couleur du succès porte l'identité.

### Named Rules

**La Règle du Radius Cohérent.** À l'intérieur d'un même écran, les cartes portent toutes le même radius (12px par défaut, 14px en mobile). Une carte 8 et une carte 14 sur la même vue est une désynchronisation à corriger.

## Components

### Buttons
Le bouton est le geste : sa taille dit son importance, sa couleur dit son sens.

- **Primary (Bleu Rivière plein)** — fond `#1a56db`, texte blanc, radius **xl (12px)** en terrain / **md (8px)** en desktop, height **50px** (terrain) / **42px** (desktop), poids 700, ombre Levée Terrain ou Levée. Le geste "faire" par défaut.
- **Success (Vert dégradé)** — `linear-gradient(135deg, #166534, #15803d)`, texte blanc, radius **xl**, height **50px**, ombre Levée Succès. Réservé aux confirmations terrain (valider un relevé, réactiver un abonné).
- **Dark (Navy plein)** — `#0f1c3d`, texte blanc, radius **md**, hover `#1a2e5a`. Alternative primaire quand le contexte est déjà bleu (facture avec ligne bleue).
- **Ghost (Blanc + bordure)** — `#ffffff`, texte `#475569`, bordure `1px #e2e8f0`, hover `#f8fafc`. Action secondaire, filtre, "Annuler".
- **Danger Outline** — `#fef2f2`, texte `#dc2626`, bordure `1.5px #fecaca`. Réservé aux actions destructives (résilier, supprimer un relevé).
- **Press feedback** — *tous* les `.btn` de l'app portent `transform: scale(0.97)` au `:active` avec transition `160ms var(--ease-out)`. `prefers-reduced-motion` est respecté globalement.

### Chips (filtre)
- **Style** — radius **pill (999px)**, height **38px** (desktop) / **28px** (mobile), padding `0 16px`, poids 600, fond `#ffffff` + bordure `1px #e2e8f0`.
- **Actif** — fond `#0f1c3d` (Navy Nuit), texte blanc, même bordure. Compte optionnel à droite (opacité 0.8 quand actif, 0.55 sinon).
- **Hover** — fond `#f8fafc` (Ardoise Brise) — jamais bleu.

### Cards / Containers
- **Corner** — radius **xl (12px)** en desktop, **xl2 (14px)** en mobile.
- **Background** — `#ffffff`.
- **Shadow** — *aucune* au repos (voir Règle du Plat au Repos). Élévation seulement pour les couches portées.
- **Border** — `1px solid #e2e8f0`.
- **Internal padding** — `20px` par défaut, `14–16px` en mobile compact, `10–16px` pour lignes de table.

### Inputs / Fields
- **Style** — fond `#f8fafc` (Ardoise Brise), bordure `1px #e2e8f0`, radius **md (8px)**, padding `13px 14px`, poids 400, texte `#0f172a`.
- **Focus** — bordure remplacée par `2px #1a56db`, halo `box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.08–0.1)`. Halo fin et calme.
- **Error** — bordure `#ef4444`, halo `rgba(239, 68, 68, 0.08–0.1)`.
- **Placeholder** — `#cbd5e1` (Ardoise Crayon).
- **Signature terrain — `.idx-box`** — la boîte de saisie d'index a un radius 10px, une bordure 2px bleu, un chiffre poids 800 en 34px, et un halo bleu épais 3px. C'est le champ le plus important de l'app.

### Navigation
- **Sidebar desktop** — 220px de large, fond `#0f1c3d`, items 12px 500, hover `rgba(255, 255, 255, 0.06)`, actif `rgba(26, 86, 219, 0.28)` + poids 600. Icônes PrimeIcons 14px. Logo en haut, carte "campagne en cours" au-dessus de la nav, footer utilisateur en bas.
- **Sidebar mobile** — même contenu, transformée en tiroir 280px avec ombre latérale ; ouverture via le hamburger de la topbar.
- **Bottom tabs mobile** — hauteur ~64px + safe-area, 4 onglets max, icône 19px + label 10px 500. Onglet actif : texte `#1a56db` + fond icône `#eff6ff` (pilule radius 12px autour de l'icône seule).
- **Page topbar desktop** — blanche, height 54px, titre 17px 700, sticky top. Actions projetées à droite.
- **Page topbar mobile** — navy `#0f1c3d`, titre 20px blanc, chevron back + hamburger, cloche visible uniquement s'il y a des notifs non lues.

### Badges & Statuses
Toujours un triplet fond + bordure + texte (voir Règle de la Triplette Teintée).

- **Success** — `#f0fdf4` / `#bbf7d0` / `#15803d`.
- **Info** — `#eff6ff` / `#bfdbfe` / `#1d4ed8`.
- **Warning** — `#fffbeb` / `#fde68a` / `#b45309`.
- **Danger** — `#fef2f2` / `#fecaca` / `#dc2626`.
- **Neutral** — `#f1f5f9` / `#e2e8f0` / `#475569`.

Padding `3px 10px`, radius **sm (6px)**, poids 600, 10.5–11px, MAJUSCULES letter-spacing 0.3–0.5px.

### Bottom Sheet
Signature mobile de l'app. Coins hauts arrondis **sheet (24px)**, grip 40×4 en tête, ombre Sheet Portable. Sur desktop (`≥721px`), devient dialog centré (radius 16px, sans grip). Transition `cubic-bezier(0.22, 1, 0.36, 1)` 320–340ms — l'app "expire" une couche.

### Toast
Card blanche avec bordure teintée par type, radius 12px, ombre douce, slide-in droite 220ms (`cubic-bezier(0.16, 1, 0.3, 1)`). En mobile, bascule en toast **navy** (`#0f1c3d`) posé en bas — même couleur que la structure — avec icône teintée sur fond alpha 0.2. La barre de compte à rebours (3px) est masquée en mobile.

### Data Table
- **Header** — `#f8fafc`, texte `#64748b` 11px 600 MAJUSCULES 0.5px.
- **Row** — padding `13px 16px`, texte 13px `#0f172a`, bordure basse `1px #f1f5f9`.
- **Row hover** — `#f5f7fa`.
- **Row sélectionnée** — `#eff6ff` + liseré interne `inset 3px 0 0 #1a56db` (le seul liseré coloré autorisé — un bord d'insertion, pas une décoration).
- **Row danger** — `#fef9f9` (rose très pâle) pour une ligne impayée suspendue.
- **Bascule mobile** — à `≤720px`, la table s'efface au profit d'une pile de cartes 14px radius via `[appCardRow]`. La bascule est automatique dans `data-table`.

### Signature — La Bande Navy Mobile
Chaque écran mobile ouvre sur une bande `#0f1c3d` continue : page-topbar + `[topbar-hero]` projeté optionnel (progression campagne dans le dashboard). Le contenu descend ensuite sur `#f1f5f9`. C'est la constante visuelle qui permet à l'agent de reconnaître qu'il est *dans l'app en tournée* du premier coup d'œil.

## Do's and Don'ts

### Do:
- **Do** ouvrir chaque écran mobile sur une bande navy `#0f1c3d` (topbar + héro projeté si pertinent) — c'est l'ancrage spatial de l'app.
- **Do** réserver le Vert Nappe `#0e9f6e` à ce que l'app *confirme* (paiement acté, relevé pris, succès) — jamais à un empty state ou un placeholder.
- **Do** utiliser le poids Montserrat 800 uniquement pour des chiffres qui portent un montant, une consommation ou une magnitude.
- **Do** dire tout statut par un triplet : fond teinté 6px radius + bordure 1px de la même famille + texte MAJUSCULES letter-spacing 0.03–0.05em.
- **Do** garder les cartes plates au repos (bordure 1px `#e2e8f0`, aucune ombre) ; n'élever que les CTAs et les couches portées.
- **Do** teinter l'ombre d'un CTA de sa propre couleur (bleu → rgba bleu, vert → rgba vert).
- **Do** appliquer `transform: scale(0.97)` en `:active` sur *tous* les boutons `.btn` avec transition 160ms `var(--ease-out)`, en respectant `prefers-reduced-motion`.
- **Do** basculer les tables en cartes empilées via `[appCardRow]` sous 720px — jamais laisser de scroll horizontal exposé au doigt.
- **Do** router tout thème PrimeNG par `AquaBillPreset` (`src/app/core/theme/aquabill-preset.ts`) — pas de personnalisation ad-hoc dans un composant.

### Don't:
- **Don't** utiliser le Navy Nuit `#0f1c3d` pour un bouton primaire (rôle du Bleu Rivière) ni pour un état d'alerte (rôle du Rouge Alerte).
- **Don't** ajouter un liseré coloré `border-left` de plus de 1px sur cartes, alertes ou lignes — la seule exception est le `inset 3px 0 0 #1a56db` de row-sélectionnée en data-table.
- **Don't** mettre d'ombre grise neutre sous un CTA coloré — l'ombre doit prendre la teinte du CTA.
- **Don't** utiliser d'illustrations 3D, de gradients pastel ni de gamification "consumer fintech" — SGFE gère de l'eau et de l'argent réels ; le vernis desservirait la confiance.
- **Don't** empiler d'eyebrow MAJUSCULES sur chaque section — les MAJUSCULES sont réservées aux labels de KPI, en-têtes de colonnes et badges de statut.
- **Don't** utiliser de gradient text — l'emphase vient du poids Montserrat, jamais d'un effet de dégradé sur la lettre.
- **Don't** utiliser de sparkline, progress ring ou soft-shadowed rounded rectangle comme placeholder d'un graph — pour < 2 000 abonnés, un chiffre net + un pourcentage suffisent.
- **Don't** substituer une autre police à Montserrat, ni introduire une seconde famille sans raison technique (le monospace est l'exception, réservée aux id/uuid).
