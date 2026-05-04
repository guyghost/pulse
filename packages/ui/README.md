# @pulse/ui

Shared Atomic Design component library for MissionPulse.

## Usage

```svelte
<script>
  import { Button, Badge, Chip, Icon, Skeleton, GlassCard, GlowButton, Toast, Indicator } from '@pulse/ui';
</script>

<!-- Import design tokens (single source of truth) -->
<style>
  @import '@pulse/ui/app.css';
</style>
```

## Atoms

| Component | Props | Description |
|-----------|-------|-------------|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost'`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `loading`, `class`, `onclick`, `children` | Standard button |
| `Badge` | `label`, `variant: 'tech' \| 'status' \| 'source' \| 'success' \| 'warning' \| 'error'`, `size: 'sm' \| 'md'`, `class` | Inline label |
| `Chip` | `label`, `selected`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `class`, `onclick` | Selectable chip |
| `Icon` | `name: IconName`, `size: number`, `class` | Icon from registry |
| `Skeleton` | `variant: 'text' \| 'circle' \| 'card'`, `width`, `height`, `class` | Loading placeholder |
| `Indicator` | `status: 'online' \| 'offline' \| 'error' \| 'idle'`, `size: 'sm' \| 'md' \| 'lg'`, `pulse`, `class` | Status dot |
| `GlassCard` | `variant: 'default' \| 'elevated' \| 'glow'`, `padding: 'none' \| 'sm' \| 'md' \| 'lg'`, `class`, `onclick`, `children` | Card container |
| `GlowButton` | `variant: 'primary' \| 'secondary' \| 'outline'`, `size: 'sm' \| 'md' \| 'lg'`, `disabled`, `loading`, `class`, `onclick`, `children` | Emphasized button |
| `Toast` | `message`, `type: 'info' \| 'error' \| 'success' \| 'warning'`, `class`, `onDismiss` | Alert toast |

## Icons

```svelte
<script>
  import { Icon, type IconName } from '@pulse/ui';
</script>

<Icon name="search" size={16} />
<Icon name="chevron-right" class="text-text-muted" />
```

Available icons: `search`, `x`, `check`, `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up`, `refresh-cw`, `settings`, `briefcase`, `trending-up`, `trending-down`, `plus`, `minus`, `star`, `loader`, `arrow-right`, `info`, `alert-circle`, `check-circle`, `x-circle`, `link`, `external-link`, `eye`, `eye-off`, `download`, `clock`, and more.

## Actions

```svelte
<script>
  import { ripple, onVisible } from '@pulse/ui';
</script>

<div use:ripple>Click me for ripple effect</div>
<div use:onVisible={() => console.log('visible!')}>Lazy load trigger</div>
```

## Design Tokens

Import `@pulse/ui/app.css` to get the full design system (TailwindCSS 4 `@theme` block):
- Colors (`blueprint-blue`, `text-primary`, `status-red`, etc.)
- Typography scale
- Spacing
- Border radius
- Shadows

## Architecture Rules

1. **Atoms import nothing from `$lib/state/` or `$lib/core/`** — all data via props
2. **Atoms dispatch via callback props** — never direct state mutations
3. **Every atom accepts `class` prop** — escape hatch for one-off styling
4. **Standard sizes**: `sm | md | lg` across all atoms
