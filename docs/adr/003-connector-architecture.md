# ADR-003: Connector Architecture

## Status
Accepted

## Context
MissionPulse aggregates freelance missions from 6+ platforms (Free-Work, Comet, LeHibou, Hiway, Collective, CherryPick), each with different data formats (HTML scraping, JSON-LD API, SPAs). We need a uniform interface that handles authentication detection, rate limiting, and error recovery while keeping each connector's code isolated for bundle size.

## Decision

### Lazy Loading via Dynamic Imports
`src/lib/shell/connectors/index.ts` defines a `CONNECTOR_REGISTRY` mapping IDs to factory functions using dynamic `import()`. Connectors are loaded on-demand as separate Vite chunks. Static metadata (`ConnectorMeta`) is available without loading connector code, enabling fast UI rendering of the connector list.

### Base Class with Result<T,E>
`BaseConnector` provides shared infrastructure:
- **Session detection**: `detectSession()` fetches the platform URL with `credentials: 'include'`, checks for 401/403 and login-page redirects. Returns `Result<boolean, AppError>`.
- **HTTP helpers**: `fetchHTML()` and `fetchJSON()` with 15s timeout, abort controller, and single automatic retry for retryable errors (5xx, 429).
- **Sync tracking**: `getLastSync()` / `setLastSync()` via `chrome.storage.local`.

Each concrete connector implements only `fetchMissions(now)`, calling the base fetch helpers and delegating parsing to a Core pure parser.

### Core Parsers vs Shell Connectors
Following FC&IS (ADR-001), HTML/JSON parsing is in `core/connectors/*-parser.ts` (pure, testable with fixtures). The Shell connector orchestrates I/O and calls the parser.

### Rate Limiting
Configurable via `AppSettings.respectRateLimits` and `customDelayMs`. Base fetch methods include abort timeouts. The scanner sequences connector calls rather than parallelizing them.

## Consequences
- **Positive**: Adding a new platform requires only a parser (Core) + connector (Shell) + registry entry. No changes to scan logic.
- **Positive**: Lazy loading keeps initial bundle small. Unused connectors are never loaded.
- **Positive**: `Result<T,E>` in every connector method makes error handling explicit and composable.
- **Negative**: Base class inheritance is less compositional than pure functions. Acceptable trade-off for shared HTTP/session logic.
