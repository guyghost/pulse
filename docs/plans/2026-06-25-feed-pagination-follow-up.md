# Feed Pagination Follow-Up

## Context

The extension currently keeps the v1 behavior where the feed can hydrate from
`getMissions()`, which reads up to 10,000 mission records and then lets the
facade/UI derive the operational views in memory.

## Task

Replace the full-feed hydration path with cursor/page-based reads without
changing the user experience:

- expose a paginated facade for feed mission slices;
- keep counts, filters, saved views and comparison behavior stable;
- preserve the existing first-screen feed state and pending-mission flow;
- add regression coverage for large local datasets.

## Exit Criteria

- `getMissions()` is no longer used by the primary feed page bootstrap path;
- large datasets do not require reading 10,000 missions before the feed becomes
  interactive;
- existing feed, tracking, comparison and settings tests remain green.
