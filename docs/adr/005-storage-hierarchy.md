# ADR-005: 4-Layer Storage Hierarchy

## Status
Accepted

## Context
A Chrome extension side panel opens and closes frequently. Fetching all missions from IndexedDB on every panel open is slow. Meanwhile, settings and lightweight state (favorites, seen IDs) need to survive extension updates, but session-scoped state (scan progress, new mission count) should not. We needed a storage strategy that balances speed, persistence, and data integrity.

## Decision
Four storage layers, each with a distinct purpose:

### 1. Memory Cache (`db-cache.ts`)
- In-process `Map<string, CacheEntry>` with TTL (5s for missions, 30s for profile).
- Global version counter for manual invalidation.
- `db-with-cache.ts` wraps IndexedDB reads: check cache first, fall back to DB on miss/expiry.
- Writes invalidate the cache immediately to prevent stale reads.

### 2. IndexedDB (`db.ts`)
- Primary persistence for missions and user profile.
- Object stores with indexes (`source`, `scrapedAt`) for efficient queries.
- **Validation on read**: `getMissions()` runs every record through `parseMission()` (Zod + type guards), silently discarding corrupted entries with a warning log. Protects against schema drift across extension updates.

### 3. chrome.storage.local (`chrome-storage.ts`, `favorites.ts`, `seen-missions.ts`)
- Settings, enabled connectors, favorites, hidden missions, seen IDs, semantic cache.
- Survives extension updates. Syncs across Chrome profiles if sync storage is used.
- Small key-value data only (Chrome enforces quota).

### 4. Session Storage (`session-storage.ts`)
- Ephemeral state: current scan status, new mission count since last view.
- Lost on side panel close -- by design. Avoids stale "3 new missions" badges after restart.

### Validation Strategy
Zod schemas (`core/types/schemas.ts`) + runtime type guards (`core/types/type-guards.ts`) validate data read from IndexedDB and chrome.storage. Invalid data is logged and discarded rather than crashing the UI. This guards against corruption from concurrent writes or schema changes between extension versions.

## Consequences
- **Positive**: Side panel opens fast (cache hit for missions in ~0ms vs ~50ms IndexedDB read).
- **Positive**: Schema validation on read prevents runtime crashes from corrupted data.
- **Positive**: Clear separation of concerns: each layer has one job and one lifetime.
- **Negative**: Cache invalidation complexity. Writes must invalidate to prevent stale reads.
- **Negative**: 4 layers means more code to maintain and more places where data can diverge.
