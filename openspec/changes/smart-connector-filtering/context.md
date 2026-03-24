# Context: Smart Connector Filtering

## Objective
Passer des paramètres de recherche côté serveur à chaque connecteur pour maximiser la pertinence des missions. Au lieu de fetcher des résultats bruts (ex: 250 missions Freelance sur FreeWork) et de scorer après-coup, les connecteurs doivent envoyer les mots-clés de l'utilisateur à leur API respective.

## Contraintes
- Platform: Web (Chrome Extension MV3)
- Architecture: FC&IS (Core pur / Shell I/O)
- Design System: Atomic Design Svelte 5

## Problème actuel
- FreeWork: `?page=N&itemsPerPage=50&contracts=contractor` → 250 missions non filtrées
- LeHibou: `POST {}` → body vide, aucun filtre
- Hiway: `select=*&order=created_at.desc&limit=100` → aucun filtre texte
- CherryPick: `POST { page: N }` → aucun filtre
- Collective: GraphQL avec `query: '', skills: [], locations: []` → tout vide

Tous les connecteurs fetchent le plus large possible. Le scoring post-fetch est le seul mécanisme de filtrage.

## Décisions techniques

| Décision | Justification | Agent |
|----------|---------------|-------|
| Ajouter `searchKeywords: string[]` au UserProfile | Champ explicite pour mots-clés de recherche côté serveur | @orchestrator |
| Créer `ConnectorSearchContext` + `buildSearchContext()` pur | Core: transformation pure profile+lastSync → params structurés | @orchestrator |
| Mettre à jour `fetchMissions(now, context?)` | Connecteurs reçoivent le contexte de recherche | @orchestrator |
| Scanner charge profil AVANT le fetch | Le profil est nécessaire pour construire les URLs filtrées | @orchestrator |

## Paramètres API disponibles par connecteur

| Connecteur | Recherche | Skills | Date | Tri | Statut |
|-----------|-----------|--------|------|-----|--------|
| **FreeWork** | `q` | `properties[]` | `createdAt[after]` | `order[publishedAt]` | API Hydra documentée |
| **Collective** | `query` | `skills[]` | — | `sort` | GraphQL, champs existent |
| **LeHibou** | ? (POST body) | ? | — | — | À explorer |
| **Hiway** | Supabase `ilike` | — | `created_at=gt.X` | `order` | Supabase REST |
| **CherryPick** | ? (POST body) | ? | — | — | À explorer |

## Fichiers à modifier

### Core (Pure — zéro I/O, zéro async)
| Fichier | Action | Description |
|---------|--------|-------------|
| `src/lib/core/types/profile.ts` | MODIFY | Ajouter `searchKeywords: string[]` |
| `src/lib/core/connectors/search-context.ts` | CREATE | Type `ConnectorSearchContext` + fonction `buildSearchContext()` pure |

### Shell (I/O, async, side effects)
| Fichier | Action | Description |
|---------|--------|-------------|
| `src/lib/shell/connectors/platform-connector.ts` | MODIFY | `fetchMissions(now, context?)` |
| `src/lib/shell/connectors/base.connector.ts` | MODIFY | Abstract method signature |
| `src/lib/shell/connectors/freework.connector.ts` | MODIFY | Utiliser `q`, `properties[]`, `createdAt[after]`, `order[publishedAt]` |
| `src/lib/shell/connectors/collective.connector.ts` | MODIFY | Remplir `query`, `skills`, `locations` |
| `src/lib/shell/connectors/lehibou.connector.ts` | MODIFY | Explorer et ajouter filtres POST |
| `src/lib/shell/connectors/hiway.connector.ts` | MODIFY | Ajouter filtre texte Supabase |
| `src/lib/shell/connectors/cherrypick.connector.ts` | MODIFY | Explorer et ajouter filtres POST |
| `src/lib/shell/scan/scanner.ts` | MODIFY | Charger profil + lastSync AVANT fetch |

### Tests
| Fichier | Action | Description |
|---------|--------|-------------|
| `tests/unit/connectors/search-context.test.ts` | CREATE | Tests fonction pure `buildSearchContext()` |
| `tests/unit/connectors/freework.test.ts` | MODIFY | Mettre à jour pour nouvelle signature |

## Notes inter-agents

<!-- [@orchestrator → @codegen] Le scanner charge le profil avec getProfile() qui vient de IndexedDB. Le lastSync vient de getLastSync() sur chaque connecteur. Les deux sont disponibles AVANT le fetch. -->

## Artifacts produits
| Fichier | Agent | Status |
|--------|-------|--------|
| — | — | — |
