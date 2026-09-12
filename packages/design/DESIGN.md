# Référence de style

> Analytical Blueprint on Pure White. Une interface qui évoque un parcours méticuleusement cartographié sur une toile immaculée et bien éclairée.

**Thème :** light

Mission Pulse dégage une clarté focalisée et data-driven, présentant une automatisation financière complexe avec une confiance discrète. Le design exploite une palette monochrome avec des touches stratégiques de bleu vif et un ensemble épars, presque ludique, de couleurs d'accent vives dans les éléments secondaires. Le paysage visuel est dominé par un duo unique : une police display serif classique pour des titres impactants et un sans-serif moderne et épuré pour le texte courant, créant une impression formelle mais accessible. Les fonds quasi achromatiques et l'absence d'ombres marquées contribuent à une interface plate et aérée, qui élève le contenu par une typographie soignée plutôt que par des effets visuels lourds. Un bleu de marque subtil est employé avec parcimonie, principalement pour souligner les éléments interactifs, guidant l'attention avec précision.

## Tokens — Couleurs

| Nom            | Valeur    | Token                    | Rôle                                                                                                                                                                |
| -------------- | --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page Canvas    | `#f5f5f4` | `--color-page-canvas`    | Fond principal des pages et sections majeures, fournissant une base claire et lumineuse.                                                                            |
| Surface White  | `#ffffff` | `--color-surface-white`  | Utilisé pour cartes, panneaux et éléments devant se détacher légèrement du fond principal, souvent comme conteneurs de contenu.                                     |
| Blueprint Blue | `#0b64e9` | `--color-blueprint-blue` | Accent de marque principal, utilisé pour tous les calls-to-action, états interactifs et éléments de navigation clés, attirant l'œil sans saturer.                   |
| Text Primary   | `#0c0a09` | `--color-text-primary`   | Texte courant, titres et informations critiques pour une lisibilité maximale sur fonds clairs.                                                                      |
| Text Secondary | `#1c1917` | `--color-text-secondary` | Sous-titres, textes de support et informations moins mises en avant, un cran plus léger que le texte principal tout en restant très contrasté.                      |
| Text Muted     | `#6b6561` | `--color-text-muted`     | Texte placeholder, labels mineurs et détails complémentaires, présence visuelle plus douce.                                                                         |
| Text Subtle    | `#57534d` | `--color-text-subtle`    | Texte moins proéminent comme les captions ou descriptions, visuellement en retrait tout en restant lisible.                                                         |
| Text On Bright | `#0c0a09` | `--color-text-on-bright` | Texte sur remplissages saturés de statut/accent (badges de note, tags). Ne bascule jamais en thème sombre car ses remplissages gardent leurs valeurs du mode clair. |
| Subtle Gray    | `#ececea` | `--color-subtle-gray`    | Fonds pour conteneurs discrets comme les badges ou petits éléments de carte, offrant une légère différenciation.                                                    |
| Border Light   | `#f0efef` | `--color-border-light`   | Distingue les éléments UI avec une bordure subtile, en particulier pour les champs de formulaire et éléments interactifs.                                           |
| Disabled Gray  | `#d4d2d1` | `--color-disabled-gray`  | Utilisé pour les états désactivés des composants interactifs, indiquant la non-interactivité.                                                                       |
| Status Red     | `#f24149` | `--color-status-red`     | Indicateur d'erreurs ou d'alertes importantes, attirant rapidement l'attention.                                                                                     |
| Status Orange  | `#f97006` | `--color-status-orange`  | Mise en avant des avertissements ou informations de priorité modérée.                                                                                               |
| Status Yellow  | `#f9b703` | `--color-status-yellow`  | Pour les highlights informatifs ou indicateurs de statut moins critiques.                                                                                           |
| Status Violet  | `#6b4aff` | `--color-status-violet`  | Probablement pour des tags ou catégories de statut spécifiques, fournissant une distinction visuelle.                                                               |
| Accent Green   | `#0d9488` | `--color-accent-green`   | Signal de support positif ou de succès, utilisé avec parcimonie pour les états de statut secondaires.                                                               |
| Accent Amber   | `#d97706` | `--color-accent-amber`   | Signal de support de prudence, utilisé avec parcimonie pour les états de statut de priorité moyenne.                                                                |

## Tokens — Typographie

### FH Total Display Regular — Titres hero et display — la police signature pour l'impact de marque, créant une présence élégante et autoritaire avec des tailles extrêmes et un interlignage serré. · `--font-fh-total-display-regular`

- **Substitut :** Playfair Display
- **Graisses :** 400
- **Tailles :** 106px, 183px
- **Interlignage :** 0.80
- **Rôle :** Titres hero et display — la police signature pour l'impact de marque, créant une présence élégante et autoritaire avec des tailles extrêmes et un interlignage serré.

### Geist — Texte courant et sous-titres principaux — un sans-serif géométrique moderne qui équilibre la police display classique avec clarté et lisibilité numérique. · `--font-geist`

- **Substitut :** Inter
- **Graisses :** 400, 500
- **Tailles :** 14px, 16px, 18px, 20px, 24px, 28px
- **Interlignage :** 1.20, 1.30, 1.40
- **Interlettrage :** -0.02
- **Fonctionnalités OpenType :** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`
- **Rôle :** Texte courant et sous-titres principaux — un sans-serif géométrique moderne qui équilibre la police display classique avec clarté et lisibilité numérique.

### system-ui — Texte secondaire et contenu utilitaire — assure une large compatibilité et de bonnes performances pour les petits blocs de texte, en tirant parti des polices système. · `--font-system-ui`

- **Graisses :** 400, 500
- **Tailles :** 10px, 12px, 14px
- **Interlignage :** 1.30
- **Interlettrage :** -0.03
- **Rôle :** Texte secondaire et contenu utilitaire — assure une large compatibilité et de bonnes performances pour les petits blocs de texte, en tirant parti des polices système.

### sans-serif — Plus petit texte UI, labels et métadonnées — un sans-serif simple de repli pour les éléments textuels minimes où l'espace est contraint. · `--font-sans-serif`

- **Graisses :** 400
- **Tailles :** 12px
- **Interlignage :** 1.20
- **Rôle :** Plus petit texte UI, labels et métadonnées — un sans-serif simple de repli pour les éléments textuels minimes où l'espace est contraint.

### Échelle typographique

Basée sur les rem, fixe (registre produit). L'interlettrage volontairement **absent** des tokens de texte —
il est défini par élément (labels en majuscules très espacés, corps neutre). Les tokens suivent le
namespace Tailwind v4 `--text-*` / `--text-*--line-height` pour que les utilitaires `text-*` soient générés.

| Rôle            | rem     | px  | Interlignage | Absorbe                         | Token                    |
| --------------- | ------- | --- | ------------ | ------------------------------- | ------------------------ |
| micro           | 0.625   | 10  | 1.4          | micro-labels 8–10px             | `--text-micro`           |
| caption         | 0.6875  | 11  | 1.45         | texte secondaire 11px           | `--text-caption`         |
| meta            | 0.75    | 12  | 1.5          | `text-xs`, métadonnées 12px     | `--text-meta`            |
| body            | 0.8125  | 13  | 1.55         | `text-[13px]`, texte courant    | `--text-body`            |
| body-lg         | 0.875   | 14  | 1.55         | `text-sm`, 14px                 | `--text-body-lg`         |
| subheading      | 1       | 16  | 1.4          | `text-base`, 16px               | `--text-subheading`      |
| heading         | 1.125   | 18  | 1.3          | `text-lg`, 18px                 | `--text-heading`         |
| heading-lg      | 1.25    | 20  | 1.25         | `text-xl`, 20px                 | `--text-heading-lg`      |
| display-sm      | 1.5     | 24  | 1.2          | `text-2xl`, 24px                | `--text-display-sm`      |
| display         | 1.75    | 28  | 1.15         | 28px                            | `--text-display`         |
| display-lg      | 2.25    | 36  | 1.1          | empty-state / grand display     | `--text-display-lg`      |
| hero-headline-1 | 6.625   | 106 | 0.8          | hero landing (superposé, serré) | `--text-hero-headline-1` |
| hero-headline-2 | 11.4375 | 183 | 0.8          | hero landing (superposé, serré) | `--text-hero-headline-2` |

## Tokens — Espacements & formes

**Unité de base :** 4px

**Densité :** compacte

### Échelle d'espacement

| Nom | Valeur | Token           |
| --- | ------ | --------------- |
| 4   | 4px    | `--spacing-4`   |
| 8   | 8px    | `--spacing-8`   |
| 12  | 12px   | `--spacing-12`  |
| 16  | 16px   | `--spacing-16`  |
| 20  | 20px   | `--spacing-20`  |
| 24  | 24px   | `--spacing-24`  |
| 32  | 32px   | `--spacing-32`  |
| 36  | 36px   | `--spacing-36`  |
| 40  | 40px   | `--spacing-40`  |
| 44  | 44px   | `--spacing-44`  |
| 80  | 80px   | `--spacing-80`  |
| 120 | 120px  | `--spacing-120` |
| 140 | 140px  | `--spacing-140` |

### Rayons de bordure

| Élément | Valeur |
| ------- | ------ |
| pill    | 100px  |
| large   | 12px   |
| buttons | 8px    |
| default | 6px    |

### Ombres

| Nom      | Valeur                                  | Token               |
| -------- | --------------------------------------- | ------------------- |
| sm       | `rgba(0, 0, 0, 0.06) 0px 2px 4px 0px`   | `--shadow-sm`       |
| subtle   | `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`    | `--shadow-subtle`   |
| subtle-2 | `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px`   | `--shadow-subtle-2` |
| subtle-3 | `rgba(0, 0, 0, 0.08) 0px 2px 3px 0px`   | `--shadow-subtle-3` |
| xl       | `rgba(0, 0, 0, 0.25) 0px 14px 32px 0px` | `--shadow-xl`       |

### Layout

- **Padding des cartes :** 16px
- **Gap entre éléments :** 4-16px

## Composants

### Primary Filled Button

**Rôle :** Élément interactif

Fond bleu Blueprint Blue plein (#0b64e9), texte blanc (#ffffff), rayon 8px, padding vertical 12px, padding horizontal 12-16px. Signale de façon prominente les actions primaires.

### Secondary Outlined Button

**Rôle :** Élément interactif

Fond Subtle Gray (#f0efef), texte Blueprint Blue (#0000ee — défaut navigateur, bleu de marque déduit #0b64e9), avec une bordure 1px assortie au texte ou Blueprint Blue si aucune couleur de bordure n'est spécifiée. Rayon 8px, padding vertical 8px, padding horizontal 12px. Utilisé pour les actions moins prominentes.

### Text Link

**Rôle :** Texte de navigation/interactif

Texte Blueprint Blue (#0b64e9, bien que les données montrent le défaut navigateur #0000ee pour les liens), généralement en police Geist. Utilisé pour la navigation en ligne et le texte cliquable.

### Header Navigation Item

**Rôle :** Navigation globale

Généralement police Geist, graisse 400, taille 14px, texte #6b6561 devenant #000000 au survol. Simple lien texte pour la navigation de premier niveau.

### Display Headline - « The Grand Statement »

**Rôle :** Contenu hero

FH Total Display Regular, 183px, interlignage 0.8, couleur #1c1917, généralement suivi d'un équivalent atténué à 106px en #d4d2d1, créant un effet de titre superposé et emphatique pour les sections hero.

### Eyebrow Label

**Rôle :** Label de catégorisation de section/champ

Le micro-label canonique au-dessus ou à côté du contenu. Police système, taille micro (10px), graisse 500, majuscules, interlettrage 0.15em, Text Muted (#6b6561). Défini une seule fois dans `@pulse/ui` comme `.eyebrow` (couche components).

Modifieurs : `.eyebrow--caption` (taille caption 12px, pour contextes moins denses), `.eyebrow--strong` (graisse 600), `.eyebrow--subtle` (Text Subtle #57534d), `.eyebrow--blue` (Blueprint Blue #0b64e9, pour les marqueurs de section sous les en-têtes de page), `.eyebrow--inherit` (`color: inherit`, pour les labels dans des conteneurs teintés dont la tonalité doit suivre l'ancêtre plutôt que le défaut atténué).

Les tonalités ponctuelles rares (couleurs de statut, bleus translucides) s'appliquent comme utilitaires de couleur au point d'appel, superposés à la base — ils priment sur la couleur du composant car les utilitaires dominent la couche components.

**Ne jamais** recomposer la combinaison à la main avec des utilitaires (`text-micro uppercase tracking-[0.15em] …`) — utiliser la classe pour que l'interlettrage, la graisse et la taille restent gouvernés à un seul endroit.

## À faire / à ne pas faire

### À faire

- Utiliser « FH Total Display Regular » uniquement pour les titres de niveau hero (106px, 183px) pour asseoir la gravité de marque ; réserver le serif pour un impact maximal.
- Appliquer « Blueprint Blue » (#0b64e9) exclusivement aux calls-to-action primaires et aux états actifs pour maintenir une hiérarchie visuelle claire.
- Employer le « Page Canvas » « #f5f5f4 » pour tous les fonds de page principaux afin de garantir une esthétique spacieuse et nette.
- Utiliser la police Geist avec un interlettrage de -0.02em pour tout le texte courant et les sous-titres afin de préserver la typographie numérique distinctive.
- Standardiser sur des rayons de 6px pour tous les éléments généraux et 8px pour les boutons, sauf les formes pill qui utilisent 100px.
- Toujours utiliser « Text Primary » (#0c0a09) pour le texte principal et « Text Secondary » (#1c1917) pour le sous-contenu sur fonds clairs pour un contraste optimal.

### À ne pas faire

- Ne pas utiliser plusieurs couleurs saturées pour les éléments interactifs primaires ; Blueprint Blue (#0b64e9) est l'unique identifiant de marque.
- Éviter les ombres portées fortes et lourdes ; préférer des ombres subtiles comme rgba(0, 0, 0, 0.06) 0px 2px 4px 0px pour une élévation minimale.
- Ne pas utiliser de polices système génériques pour les titres proéminents ; FH Total Display Regular est réservée à la distinction de marque.
- Éviter d'utiliser la couleur pour signifier la hiérarchie sur le texte ; s'appuyer plutôt sur les graisses, tailles et l'échelle neutre spécifiée (Text Primary, Secondary, Muted).
- Ne pas introduire de nouveaux rayons de bordure en dehors de 1px, 6px, 8px, 12px, 16px, 20px, 30px, 36px et 100px pour maintenir un rythme géométrique cohérent.

## Élévation

- **Conteneur de carte :** `rgba(0, 0, 0, 0.06) 0px 2px 4px 0px`
- **Conteneur de carte (subtil) :** `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`
- **Bouton :** `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 2px 3px 0px`
- **Lien avec forte élévation :** `rgba(0, 0, 0, 0.25) 0px 14px 32px 0px`

## Imagerie

Le langage visuel est principalement centré UI, avec des captures produit nettes et des graphiques abstraits géométriques. Les captures produit sont généralement contenues dans des mockups d'appareils ou des cadres rectangulaires simples, présentant clairement les fonctionnalités. On note l'absence de photographie traditionnelle ou d'illustrations complexes. L'iconographie est minimaliste, en contour ou remplie en monochrome ou bleu de marque, servant surtout de repères fonctionnels. La densité d'imagerie est équilibrée, en support du contenu textuel sans le dominer, visant une clarté explicative plutôt qu'une atmosphère décorative. De petits touches éparses de couleurs vives (jaune, rouge, orange, violet) apparaissent dans des éléments qui jouent le rôle d'indicateurs de statut ou de petits points de données, suggérant une vocation de visualisation de données ou de taggage.

## Layout

La page utilise principalement une mise en page à largeur maximale contenue, probablement centrée, bien que la largeur max spécifique ne soit pas définie. La section hero met en scène un titre display proéminent et centré sur un fond « Page Canvas » épuré. Les sections sont généralement empilées verticalement avec un espacement visible, créant une sensation d'aération. Le contenu s'organise souvent en pile centrée ou en simple colonne au texte dense. Il existe des dispositions multi-colonnes, comme une liste de fonctionnalités ou une grille de cartes, mais la présentation globale privilégie des blocs d'information clairs et non encombrés. La navigation est une barre supérieure standard, sticky ou non. La seconde capture montre une UI applicative contenue avec onglets et structures internes type cartes, indiquant une interface proche d'une application.

## Guide de prompts pour agents

1. **Référence rapide des couleurs :**
   - Text Primary : #0c0a09
   - Fond de page : #f5f5f4
   - Bleu CTA : #0b64e9
   - Surface White : #ffffff
   - Text Muted : #6b6561

2. **Exemples de prompts de composants :**
   - Créer un bouton primaire plein : fond Blueprint Blue (#0b64e9), texte blanc (#ffffff), rayon 8px, avec 12px de padding vertical et 16px de padding horizontal. Texte en Geist, 16px, graisse 500.
   - Générer un conteneur de carte : fond Surface White (#ffffff), rayon 6px, avec une ombre subtile (rgba(0, 0, 0, 0.1) 0px 1px 2px 0px). Padding du contenu 16px.
   - Concevoir un titre de section hero : « Revenue. » en FH Total Display Regular, 183px, graisse 400, couleur #1c1917, interlignage 0.8. En dessous, « On autopilot. » en FH Total Display Regular, 106px, graisse 400, couleur #d4d2d1, interlignage 0.8.
   - Produire un tag de statut : fond Status Red (#f24149), texte blanc, rayon 6px, petit padding (ex. 4px vertical, 8px horizontal). Texte en system-ui, 12px, graisse 400.
   - Créer un bouton secondaire outline : fond Subtle Gray (#f0efef), texte Blueprint Blue (#0b64e9), bordure 1px en Blueprint Blue, rayon 8px, padding vertical 8px, padding horizontal 12px. Texte en Geist, 14px, graisse 400.

## Marques similaires

- **Linear** — Partage une UI minimaliste, épurée et très contrastée avec un fort accent sur la typographie et une utilisation subtile d'une couleur d'accent unique (bleu/violet) sur des fonds majoritairement blanc-gris.
- **Stripe** — Adopte une esthétique sophistiquée mais simple, combinant des sans-serifs modernes avec un usage stratégique du blanc, des gris et une couleur de marque distincte pour les éléments interactifs, présentant clairement des données financières complexes.
- **Vercel** — Affiche une esthétique d'outil développeur similaire avec une typographie nette, des espacements précis et un usage pragmatique de l'élévation et de gris subtils, souvent avec un accent de marque dédié.
- **Superhuman** — Connue pour son interface blanche très léchée, presque austère, priorisant la fonction et la hiérarchie de l'information par une typographie méticuleuse et des touches de couleur minimales mais efficaces.

## Quick Start

### Custom properties CSS

```css
:root {
  /* Couleurs */
  --color-page-canvas: #f5f5f4;
  --color-surface-white: #ffffff;
  --color-blueprint-blue: #0b64e9;
  --color-text-primary: #0c0a09;
  --color-text-secondary: #1c1917;
  --color-text-muted: #6b6561;
  --color-text-subtle: #57534d;
  --color-text-on-bright: #0c0a09;
  --color-subtle-gray: #ececea;
  --color-border-light: #f0efef;
  --color-disabled-gray: #d4d2d1;
  --color-status-red: #f24149;
  --color-status-orange: #f97006;
  --color-status-yellow: #f9b703;
  --color-status-violet: #6b4aff;

  /* Typographie — Familles */
  --font-fh-total-display-regular:
    'FH Total Display Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif;
  --font-geist:
    'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-system-ui:
    'system-ui', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-sans-serif:
    'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;

  /* Typographie — Échelle (basée sur les rem ; namespace Tailwind v4 --text-* / --text-*--line-height) */
  --text-micro: 0.625rem;
  --text-micro--line-height: 1.4;
  --text-caption: 0.6875rem;
  --text-caption--line-height: 1.45;
  --text-meta: 0.75rem;
  --text-meta--line-height: 1.5;
  --text-body: 0.8125rem;
  --text-body--line-height: 1.55;
  --text-body-lg: 0.875rem;
  --text-body-lg--line-height: 1.55;
  --text-subheading: 1rem;
  --text-subheading--line-height: 1.4;
  --text-heading: 1.125rem;
  --text-heading--line-height: 1.3;
  --text-heading-lg: 1.25rem;
  --text-heading-lg--line-height: 1.25;
  --text-display-sm: 1.5rem;
  --text-display-sm--line-height: 1.2;
  --text-display: 1.75rem;
  --text-display--line-height: 1.15;
  --text-display-lg: 2.25rem;
  --text-display-lg--line-height: 1.1;
  /* Bande hero (display landing). Conservées en vars ; converties px → rem. */
  --text-hero-headline-1: 6.625rem;
  --text-hero-headline-1--line-height: 0.8;
  --text-hero-headline-2: 11.4375rem;
  --text-hero-headline-2--line-height: 0.8;

  /* Typographie — Graisses */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Espacements */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;

  /* Layout */
  --card-padding: 16px;
  --element-gap: 4-16px;

  /* Rayons de bordure */
  --radius-sm: 1px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 36px;
  --radius-full: 100px;
  --radius-full-2: 220px;

  /* Rayons nommés */
  --radius-pill: 100px;
  --radius-large: 12px;
  --radius-buttons: 8px;
  --radius-default: 6px;

  /* Ombres */
  --shadow-sm: rgba(0, 0, 0, 0.06) 0px 2px 4px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.04) 0px 1px 2px 0px;
  --shadow-subtle-3: rgba(0, 0, 0, 0.08) 0px 2px 3px 0px;
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 14px 32px 0px;
}
```

### Tailwind v4

```css
@theme {
  /* Couleurs */
  --color-page-canvas: #f5f5f4;
  --color-surface-white: #ffffff;
  --color-blueprint-blue: #0b64e9;
  --color-text-primary: #0c0a09;
  --color-text-secondary: #1c1917;
  --color-text-muted: #6b6561;
  --color-text-subtle: #57534d;
  --color-text-on-bright: #0c0a09;
  --color-subtle-gray: #ececea;
  --color-border-light: #f0efef;
  --color-disabled-gray: #d4d2d1;
  --color-status-red: #f24149;
  --color-status-orange: #f97006;
  --color-status-yellow: #f9b703;
  --color-status-violet: #6b4aff;

  /* Typographie */
  --font-fh-total-display-regular:
    'FH Total Display Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif;
  --font-geist:
    'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-system-ui:
    'system-ui', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-sans-serif:
    'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;

  /* Typographie — Échelle (basée sur les rem ; namespace Tailwind v4 --text-* / --text-*--line-height) */
  --text-micro: 0.625rem;
  --text-micro--line-height: 1.4;
  --text-caption: 0.6875rem;
  --text-caption--line-height: 1.45;
  --text-meta: 0.75rem;
  --text-meta--line-height: 1.5;
  --text-body: 0.8125rem;
  --text-body--line-height: 1.55;
  --text-body-lg: 0.875rem;
  --text-body-lg--line-height: 1.55;
  --text-subheading: 1rem;
  --text-subheading--line-height: 1.4;
  --text-heading: 1.125rem;
  --text-heading--line-height: 1.3;
  --text-heading-lg: 1.25rem;
  --text-heading-lg--line-height: 1.25;
  --text-display-sm: 1.5rem;
  --text-display-sm--line-height: 1.2;
  --text-display: 1.75rem;
  --text-display--line-height: 1.15;
  --text-display-lg: 2.25rem;
  --text-display-lg--line-height: 1.1;
  /* Bande hero (display landing). Conservées en vars ; converties px → rem. */
  --text-hero-headline-1: 6.625rem;
  --text-hero-headline-1--line-height: 0.8;
  --text-hero-headline-2: 11.4375rem;
  --text-hero-headline-2--line-height: 0.8;

  /* Espacements */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;

  /* Rayons de bordure */
  --radius-sm: 1px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 36px;
  --radius-full: 100px;
  --radius-full-2: 220px;

  /* Ombres */
  --shadow-sm: rgba(0, 0, 0, 0.06) 0px 2px 4px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.04) 0px 1px 2px 0px;
  --shadow-subtle-3: rgba(0, 0, 0, 0.08) 0px 2px 3px 0px;
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 14px 32px 0px;
}
```
