# Context: Code Cleanup

## Objectif
Supprimer le code mort :
- Connecteur Comet (plus utilisé)
- XState 5 (jamais installé/utilisé)
- Fichiers non utilisés (virtual-list, db-cache, db-with-cache)

## Nettoyage Effectué

### Fichiers Modifiés
| Fichier | Description |
|---------|-------------|
| `src/lib/core/types/mission.ts` | `MissionSource` sans Comet |
| `src/lib/core/types/schemas.ts` | `MissionSourceSchema` sans Comet |
| `src/lib/core/connectors/validate-parser-output.ts` | `validSources` sans Comet |
| `src/lib/shell/utils/rate-limiter.ts` | Config `comet.co` retirée |
| `src/manifest.json` | Host permissions Comet retirées |
| Tests unitaires | 8 tests mis à jour (comet → lehibou) |

### Fichiers Supprimés
| Fichier | Raison |
|---------|--------|
| `src/lib/core/virtualization/virtual-list.ts` | Non utilisé |
| `src/lib/shell/storage/db-cache.ts` | Non utilisé |
| `src/lib/shell/storage/db-with-cache.ts` | Non utilisé |

## Connecteurs Actifs
- `free-work`
- `lehibou`
- `hiway`
- `collective`
- `cherry-pick`

## État Final
XState 5 : ✅ Jamais utilisé (pas de dépendances, pas de code)
Comet : ✅ Supprimé de toutes les références
Code mort : ✅ 3 fichiers supprimés
