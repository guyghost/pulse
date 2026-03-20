# Context: Feed Debug - Missions non affichées

## Objective
L'utilisateur a 425 missions chargées (visible dans les métriques) mais aucune mission n'apparaît dans le feed. La carte "Missions triées" affiche "Aucune mission pour l'instant" malgré le badge indiquant 425 missions.

## Constraints
- Platform: Chrome Extension Manifest V3
- UI: Svelte 5 (runes)
- State: XState 5
- Styling: TailwindCSS 4

## Analyse du problème

### Structure du flow de données
1. **FeedPage.svelte** (ligne 66): `missions = $derived(feedSnapshot.context.filteredMissions)`
2. **FeedPage.svelte** (ligne 72-92): `displayMissions` est dérivé de `missions` avec filtres additionnels
3. **FeedPage.svelte** (ligne 106): `visibleCount = $derived(displayMissions.length)` → affiche 425 ✓
4. **FeedPage.svelte** (ligne 914): `<VirtualMissionFeed missions={displayMissions} ... />`
5. **VirtualMissionFeed.svelte** (ligne 35-41): `sortedMissions` est dérivé de `missions`
6. **VirtualMissionFeed.svelte** (ligne 66): `{#if sortedMissions.length === 0}` → affiche l'état vide ✗

### Incohérence
- `visibleCount` (dans FeedPage) = 425
- `sortedMissions.length` (dans VirtualMissionFeed) = 0

### Hypothèses
1. **Problème de réactivité Svelte 5**: Le `$derived` dans VirtualMissionFeed ne se met pas à jour quand `missions` change
2. **Timing d'initialisation**: Le composant VirtualMissionFeed est monté avant que les missions soient chargées, et la réactivité ne fonctionne pas correctement
3. **Problème avec le spread operator**: `[...missions]` pourrait créer un array vide si `missions` est undefined/null au moment de l'évaluation

### Fichiers concernés
- `/Users/guy/Developer/dev/pulse/src/ui/pages/FeedPage.svelte`
- `/Users/guy/Developer/dev/pulse/src/ui/organisms/VirtualMissionFeed.svelte`
- `/Users/guy/Developer/dev/pulse/src/ui/organisms/MissionFeed.svelte`

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| Utiliser `$derived.by()` avec checks défensifs | `$derived` simple ne réagissait pas correctement aux changements de props | @codegen |
| Protection contre undefined/null | Éviter que `[...missions]` échoue si missions est undefined | @codegen |
| Valeurs par défaut `[]` sans type assertion | `missions = []` au lieu de `missions = [] as Mission[]` | @codegen |

## Artifacts Produced
| File | Agent | Status |
|------|-------|--------|
| FeedPage.svelte | @codegen | ✅ Fixed |
| VirtualMissionFeed.svelte | @codegen | ✅ Fixed |
| MissionFeed.svelte | @codegen | ✅ Fixed |

## Inter-Agent Notes
<!-- Format: [@source → @destination] Message -->
