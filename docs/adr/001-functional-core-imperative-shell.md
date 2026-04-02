# ADR-001: Functional Core, Imperative Shell

## Status
Accepted

## Context
MissionPulse is a Chrome extension running across 2 main contexts (Service Worker, Side Panel). Sharing state and debugging across these contexts is hard. We needed an architecture that maximizes testability and keeps business logic predictable despite the inherently side-effect-heavy Chrome extension environment.

## Decision
Adopt the Functional Core, Imperative Shell (FC&IS) pattern:

- **Core** (`src/lib/core/`): Pure functions only. Parsers (`core/connectors/*-parser.ts`), scoring/dedup (`core/scoring/`), type definitions, error types, and data transformations. No I/O, no `Date.now()`, no `console.log` -- timestamps are injected as parameters.
- **Shell** (`src/lib/shell/`): All side effects. Connectors performing HTTP fetches, IndexedDB/chrome.storage access, Chrome messaging bridge, and notification services.

The boundary is enforced by convention: Core modules never import from Shell. Shell imports Core types and calls Core pure functions to transform data.

Examples:
- `core/connectors/freework-parser.ts` (pure HTML-to-Mission transform) vs `shell/connectors/freework.connector.ts` (fetches HTML, calls parser)
- `core/errors/app-error.ts` (type definitions + factory functions) vs `shell/errors/error-handler.ts` (logging, toast side effects)

## Consequences
- **Positive**: Core functions are trivially unit-testable without mocks. Parsers can be tested with HTML fixtures. Scoring logic is deterministic. Bug surface for cross-context issues is confined to Shell.
- **Positive**: Errors are serializable plain objects (required for `postMessage` between contexts), which the pure Core pattern naturally encourages.
- **Negative**: Requires discipline to keep Core pure. New contributors must understand the boundary.
- **Negative**: Some duplication between Core types and Shell wrappers (e.g., parser + connector pairs).
