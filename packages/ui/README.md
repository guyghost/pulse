# @pulse/ui

Bibliothèque de composants Atomic Design partagée pour MissionPulse.

## Usage

```svelte
<script>
  import {
    Button,
    Badge,
    Chip,
    Icon,
    Skeleton,
    GlassCard,
    GlowButton,
    Toast,
    Indicator,
  } from '@pulse/ui';
</script>

<!-- Import des design tokens (source de vérité unique) -->
<style>
  @import '@pulse/ui/app.css';
</style>
```

## Atoms

| Composant    | Props                                                                                                                                 | Description               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Button`     | `variant: 'primary' \| 'secondary' \| 'ghost'`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `loading`, `class`, `onclick`, `children`   | Bouton standard           |
| `Badge`      | `label`, `variant: 'tech' \| 'status' \| 'source' \| 'success' \| 'warning' \| 'error'`, `size: 'sm' \| 'md'`, `class`                | Label en ligne            |
| `Chip`       | `label`, `selected`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `class`, `onclick`                                                     | Chip sélectionnable       |
| `Icon`       | `name: IconName`, `size: number`, `class`                                                                                             | Icône du registre         |
| `Skeleton`   | `variant: 'text' \| 'circle' \| 'card'`, `width`, `height`, `class`                                                                   | Placeholder de chargement |
| `Indicator`  | `status: 'online' \| 'offline' \| 'error' \| 'idle'`, `size: 'sm' \| 'md' \| 'lg'`, `pulse`, `class`                                  | Point de statut           |
| `GlassCard`  | `variant: 'default' \| 'elevated' \| 'glow'`, `padding: 'none' \| 'sm' \| 'md' \| 'lg'`, `class`, `onclick`, `children`               | Conteneur de carte        |
| `GlowButton` | `variant: 'primary' \| 'secondary' \| 'outline'`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `loading`, `class`, `onclick`, `children` | Bouton mis en avant       |
| `Toast`      | `message`, `type: 'info' \| 'error' \| 'success' \| 'warning'`, `class`, `onDismiss`                                                  | Toast d'alerte            |

## Icônes

```svelte
<script>
  import { Icon, type IconName } from '@pulse/ui';
</script>

<Icon name="search" size={16} />
<Icon name="chevron-right" class="text-text-muted" />
```

Icônes disponibles : `search`, `x`, `check`, `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up`, `refresh-cw`, `settings`, `briefcase`, `trending-up`, `trending-down`, `plus`, `minus`, `star`, `loader`, `arrow-right`, `info`, `alert-circle`, `check-circle`, `x-circle`, `link`, `external-link`, `eye`, `eye-off`, `download`, `clock`, et plus.

## Actions

```svelte
<script>
  import { ripple, onVisible } from '@pulse/ui';
</script>

<div use:ripple>Cliquez pour l'effet ripple</div>
<div use:onVisible={() => console.log('visible!')}>Déclencheur de lazy load</div>
```

## Design Tokens

Importer `@pulse/ui/app.css` pour obtenir le design system complet (bloc `@theme` TailwindCSS 4) :

- Couleurs (`blueprint-blue`, `text-primary`, `status-red`, etc.)
- Échelle typographique
- Espacements
- Rayons de bordure
- Ombres

## Règles d'architecture

1. **Les atoms n'importent rien depuis `$lib/state/` ou `$lib/core/`** — toutes les données via props
2. **Les atoms communiquent via callback props** — jamais de mutation d'état directe
3. **Chaque atom accepte une prop `class`** — échappatoire pour un style ponctuel
4. **Tailles standard** : `sm | md | lg` sur tous les atoms
