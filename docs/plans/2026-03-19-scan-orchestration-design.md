# Design : Orchestration Scan par Actor Model

**Date** : 2026-03-19
**Statut** : Approuve

## Contexte

La remontee des donnees depuis les sources multiples souffre de plusieurs problemes :
- Scan sequentiel sans feedback granulaire par connecteur
- Un seul etat global (loading/loaded/error) sans visibilite par source
- Retry uniquement reseau, pas de gestion fine des erreurs par phase
- Rate limiter implemente mais non branche
- Pas de persistance de l'etat des connecteurs entre les sessions

## Decision

Repenser l'orchestration du scan avec le pattern Actor Model de XState 5 :
- Chaque connecteur devient un acteur ephemere avec son propre cycle de vie
- Une machine parente orchestre le sequencement et agregation des etats
- L'utilisateur a une visibilite fine : etat temps reel pendant le scan + resume persistant

## Architecture

### Connector Actor (`src/machines/connector.actor.ts`)

Machine acteur pour un connecteur unique.

**Etats :**
```
idle -> detecting -> fetching -> done
                  \-> retrying (max 3) -> error
```

| Etat | Description | Transition |
|------|-------------|------------|
| `idle` | En attente | -> `detecting` sur `START` |
| `detecting` | Verifie session/auth | -> `fetching` si ok, -> `error` si auth echouee |
| `fetching` | Appelle `fetchMissions()` | -> `done`, -> `retrying`, ou -> `error` |
| `retrying` | Backoff exponentiel, puis -> `fetching` | -> `error` apres 3 tentatives |
| `done` | Missions recuperees (etat final) | Emet `CONNECTOR_DONE` au parent |
| `error` | Echec definitif (etat final) | Emet `CONNECTOR_ERROR` au parent |

**Contexte :**
```ts
type ConnectorActorContext = {
  connectorId: string;
  connectorName: string;
  missions: Mission[];
  error: AppError | null;
  retryCount: number;
  maxRetries: number;        // 3
  startedAt: number;
  completedAt: number | null;
};
```

Les side effects (fetch, detect) sont injectes en `input` — l'acteur reste testable en isolation.

### Scan Orchestrator (`src/machines/scan.machine.ts`)

Machine parente qui sequence les connecteurs.

**Etats :**
```
idle -> preparing -> scanning -> finalizing -> done
                              \-> cancelled
```

| Etat | Description |
|------|-------------|
| `idle` | Aucun scan en cours |
| `preparing` | Charge settings, valide connecteurs, verifie connexion |
| `scanning` | Spawn sequentiellement un connector actor, attend sa fin, passe au suivant |
| `finalizing` | Dedup, scoring, persistance missions + statuts dans IndexedDB |
| `done` | Scan termine |
| `cancelled` | Scan annule par l'utilisateur |

**Contexte :**
```ts
type ScanOrchestratorContext = {
  connectorStatuses: Map<string, ConnectorStatus>;
  currentConnectorIndex: number;
  enabledConnectorIds: string[];
  missions: Mission[];
  globalError: string | null;
};

type ConnectorStatus = {
  connectorId: string;
  connectorName: string;
  state: 'pending' | 'detecting' | 'fetching' | 'retrying' | 'done' | 'error';
  missionsCount: number;
  error: AppError | null;
  retryCount: number;
  startedAt: number | null;
  completedAt: number | null;
};
```

**Sequencement dans `scanning` :**
1. Lit `currentConnectorIndex` dans `enabledConnectorIds`
2. Spawn un connector actor
3. Observe l'acteur enfant via `onSnapshot` — met a jour `connectorStatuses` en temps reel
4. Quand l'enfant atteint `done` ou `error`, incremente `currentConnectorIndex`
5. S'il reste des connecteurs -> spawn le suivant. Sinon -> `finalizing`

### Persistance IndexedDB (`connector_status`)

DB_VERSION passe de 1 a 2. Nouvelle table `connector_status` (keyPath: `connectorId`).

```ts
type PersistedConnectorStatus = {
  connectorId: string;
  connectorName: string;
  lastState: 'done' | 'error';
  missionsCount: number;
  error: SerializedAppError | null;
  lastSyncAt: number;
  lastSuccessAt: number | null;
};
```

- Ecrit dans `finalizing`, un `put()` par connecteur dans une transaction
- Lu au montage du side panel pour le resume persistant
- Pas d'historique (YAGNI) — le dernier etat ecrase le precedent

### Integration Feed Machine

La feed machine reste **inchangee**. La couche UI (FeedPage.svelte) fait la passerelle :

```
scanActor.context.connectorStatuses  ->  UI temps reel
scanActor.context.missions           ->  feedActor.send({ type: 'MISSIONS_LOADED', missions })
```

Le scan actor ne connait pas la feed machine — zero couplage.

### Service Worker (auto-scan)

Le service worker ne peut pas utiliser XState (pas de DOM). Il :
- Continue d'appeler les connecteurs directement
- Persiste les statuts dans IndexedDB
- Envoie `SCAN_COMPLETE` via le bridge
- Le side panel relit les statuts au prochain montage

## Fichiers impactes

| Action | Fichier | Description |
|--------|---------|-------------|
| Creer | `src/machines/connector.actor.ts` | Machine acteur connecteur |
| Creer | `src/machines/scan.machine.ts` | Machine orchestrator |
| Creer | `src/lib/core/types/connector-status.ts` | Types ConnectorStatus |
| Modifier | `src/lib/shell/storage/db.ts` | DB v2, table connector_status |
| Modifier | `src/ui/pages/FeedPage.svelte` | Remplacer runScan() par scan actor |
| Modifier | `src/background/index.ts` | Persister statuts lors de l'auto-scan |
| Supprimer | `src/lib/shell/scan/scanner.ts` | Remplace par les machines |
| Conserver | `src/machines/feed.machine.ts` | Inchangee |
| Conserver | `src/lib/shell/connectors/*` | Interface inchangee |
| Conserver | `src/lib/core/errors/app-error.ts` | Reutilise tel quel |
| Conserver | `src/lib/core/scoring/*` | Fonctions pures inchangees |

## Ce qu'on ne fait pas (YAGNI)

- Pas de scan parallele (sequentiel non-bloquant suffit)
- Pas d'historique des scans
- Pas de rewire du rate limiter (infrastructure en place, a brancher plus tard)
- Pas de modification de l'interface des connecteurs
