# DESIGN.md — Extension MissionPulse

> Monde visuel **réalisé** de l'extension Chrome (side panel). Ce document fait foi pour toute édition UI de `apps/extension`.
>
> - **Source amont des tokens** : [`packages/design/DESIGN.md`](../../packages/design/DESIGN.md) (thème Analytical Blueprint, tokens DTCG dans `packages/design/tokens.json`).
> - **Principes produit & anti-références** : [`PRODUCT.md`](../../PRODUCT.md) — signal sur bruit, dense mais lisible, décision en une passe, calme confiant. Le glassmorphism, les gradients décoratifs et le motion célébratoire y sont explicitement bannis.

## Identité

Analytical Blueprint sur surfaces quasi achromatiques : **esthétique plate**, accent bleu de marque employé avec parcimonie, information dense rendue scannable par la typographie et l'espacement — jamais par des effets visuels. Aucun `backdrop-blur`, aucune ombre multi-couches hard-codée (décision DAO #197 : retour au flat après un drift liquid-glass).

## Thèmes

| Thème | Activation                                                    | Mécanisme                                                                                        |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Light | Défaut                                                        | Tokens `@theme` de `packages/design/theme.css`                                                   |
| Dark  | Classe `.dark` sur `<html>` (`src/lib/state/theme.svelte.ts`) | Remap automatique des tokens sémantiques dans `packages/ui/src/app.css` (+ `color-scheme: dark`) |

Règles :

- Toujours consommer les **tokens sémantiques** (`bg-surface-white`, `text-text-primary`…) — jamais de hex ni de duplication manuelle `dark:` pour une couleur qui possède un remap.
- La variante `dark:` Tailwind ne sert qu'aux ajustements propres à une surface (ex. scrim plus profond).
- Le thème suit `light | dark | system` (préférence persistée, écoute `prefers-color-scheme`).

## Tokens — couleurs

### Neutres & accent

| Token                                 | Usage                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `page-canvas`                         | Fond de page                                                   |
| `surface-white`                       | Cartes, panneaux, dock — toujours opaque depuis #197           |
| `blueprint-blue`                      | Accent interactif (CTA, liens, états actifs) — avec parcimonie |
| `blueprint-blue-on-tint`              | Texte/icônes sur fonds tintés bleus (chips actives)            |
| `text-primary/secondary/muted/subtle` | Hiérarchie de texte (tous AA sur blanc et canvas)              |
| `subtle-gray`                         | Fonds discrets (badges, hover)                                 |
| `border-light`                        | Bordures de cartes, champs, séparateurs                        |
| `disabled-gray`                       | États désactivés                                               |

### Statuts — vives vs `-text` (AA)

| Usage                                                                                                      | Token                                              | Pourquoi                                                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Remplissages décoratifs, dots, bordures                                                                    | `status-red` · `status-orange` (vives)             | Non-texte, ≥ 3:1                                                    |
| **Tout libellé de texte** (caption, meta, eyebrow, y compris `hover:` et petites icônes porteuses de sens) | `text-status-red-text` · `text-status-orange-text` | AA 4.5:1 — les vives (3.73:1 / 2.86:1) y sont interdites (DAO #198) |

Convention chip de statut : fond tint 10–15 % (`bg-status-red/10`) + texte `-text` + label **et** icône (la couleur n'est jamais le seul porteur de sens).

## Typographie

- **Geist** (`--font-geist`) pour la totalité de l'UI. Monospace (`--font-mono`) pour les valeurs techniques.
- Échelle thémée : `text-micro` 10 · `text-caption` 11 · `text-meta` 12 · `text-body` 13 · `text-body-lg` 14 · `text-subheading` 16 · `text-heading` 18 · `text-heading-lg` 20 (interlignages thémés).
- Utilitaire `.eyebrow` pour les surtitres de section (caps, tracking large).

## Espacement, rayons, élévation

- Espacement sur grille 4 px (échelle `spacing-*`).
- Rayons : `rounded-lg` (8 px, contrôles) · `rounded-xl` (12 px, cartes) · `rounded-full` (pills, dock).
- Ombres = **tokens uniquement** : `shadow-sm` (cartes interactives), `shadow-xl` (overlays, toasts flottants). Interdit : `shadow-[…]` multi-couches, `backdrop-blur*`, `backdrop-saturate*`.
- Surfaces opaques : les headers sticky, docks et feuilles utilisent `bg-surface-white` / `bg-page-canvas` pleins (pas de `/95` + blur).

## Composants types

| Motif               | Recette                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| Carte de section    | `.section-card` / `.section-card-strong` (`src/ui/design-tokens.css`)               |
| Command dock (feed) | `rounded-full border-border-light bg-surface-white shadow-sm`, focus-within bleu    |
| Bottom sheet        | `rounded-t-[1.75rem]` + scrim `bg-text-primary/24` **sans blur**, ombre `shadow-xl` |
| Pills / chips       | `rounded-full`, bordure `border-light` ou tint 10–15 %, texte `-text` pour statuts  |
| Dots de santé       | `CircuitBadge` — glow `color-mix(var(--color-*))` (adaptatif dark)                  |

## Accessibilité opérationnelle

- Cible **WCAG 2.1 AA** : texte ≥ 4.5:1, grand texte/graphiques ≥ 3:1.
- Focus visible global : outline `blueprint-blue` + ring doux (`src/ui/design-tokens.css`).
- Touch targets ≥ 44×44 — visuellement compacts, zone cliquable étendue (pattern DAO #180, cf. `MissionCard`).
- Reduced motion : alternatives intentionnelles par composant animé + kill global dans `design-tokens.css`.
- Raccourcis clavier-first : toute action primaire atteignable sans souris.

## Motion

Minimal et fonctionnel : transitions de couleur 150–200 ms, `fly`/`fade` Svelte à faible amplitude. Pas d'animation célébratoire, pas de boucle infinie décorative.

---

_Ce document décrit l'état committé. Toute évolution du monde visuel passe par une proposition DAO (voir `docs/improvement-loop.md`) et une mise à jour de ce fichier dans le même cycle._
