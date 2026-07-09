# Location Tables Derivation Model (follow-up)

Source of truth for making `core/locations/location-catalog.ts` the **single
source of truth** from which the scorer derives its synonym and metro-area
tables. Implements the "Future" item of `location-completion.model.md`. This is
a **scoring-data change** (additive), so it gets its own model per the
Model → Review → Implement → Verify rule.

## Problem

Today there are two parallel, hand-maintained datasets describing French
places:

1. `core/scoring/location-matching.ts` → `REGION_SYNONYMS` (equivalence
   groups: `paris ↔ 75 ↔ ile de france`) and `METRO_AREAS` (proximity:
   `nanterre → paris`).
2. `core/locations/location-catalog.ts` → `LOCATION_CATALOG` (display +
   suggestion entries, each with `aliases` and an optional `metro` tag).

The catalog was _derived from_ the scorer tables when it was created, so the
two encode the same knowledge twice. Adding a place to the datalist does not
make the scorer recognize it until someone also edits the scorer's tables —
a classic drift bug waiting to happen. The fix is to delete the duplication:
the scorer should **derive** its tables from the catalog.

## Goal

`core/scoring/location-matching.ts` keeps its **algorithm** (`matchLocation`,
`normalizeLocation`, cache construction, the 7-step matching order) byte for
byte. It drops the hardcoded `REGION_SYNONYMS` and `METRO_AREAS` constants and
instead imports tables **derived** from `LOCATION_CATALOG` by a new pure module
`core/locations/derive-location-tables.ts`.

After this change there is exactly one place to edit when a French city is
added: the catalog. The datalist and the scorer update together.

## Non-goals

- No change to the `matchLocation` algorithm, its step ordering, or its return
  type. The matching semantics are frozen by the existing 428-line test file
  `tests/unit/scoring/location-matching.test.ts`.
- No change to `relevance.ts` or `DEFAULT_SCORING_WEIGHTS`.
- No change to `UserProfile.location` shape, persistence, or messages.
- No geolocation, no network, no new permissions (carried over from the
  completion model).

## Data flow (after)

```
LOCATION_CATALOG (core/locations/location-catalog.ts)   ← single source
   │
   ▼  deriveRegionSynonyms() / deriveMetroAreas()   (pure, core/locations/)
REGION_SYNONYMS, METRO_AREAS  (in core/locations/derive-location-tables.ts)
   │
   ▼  imported by
core/scoring/location-matching.ts
   │  builds SYNONYM_CACHE / METRO_AREA_CACHE / METRO_DEPARTMENT_CACHE (unchanged)
   ▼
matchLocation(mission.location, profile.location)        ← algorithm unchanged
```

Direction respects the layering rule: scorer (core) imports data (core). No
shell, no UI, no I/O.

## Derivation rules

### `deriveRegionSynonyms(catalog): Record<string, readonly string[]>`

**One group per _canonical_ entry only.** A canonical entry is one that is
either not part of any metro (`entry.metro` is undefined — regional capitals,
Remote) **or** is the canonical city of its metro
(`normalizeLocationAlias(entry.label) === entry.metro` — Paris, Lyon, …).

Suburb entries (`entry.metro` set and label ≠ metro, e.g. Nanterre,
Villeurbanne) are **excluded** from synonym groups. They are represented only
in `METRO_AREAS` (proximity). This is not cosmetic: without it, department
codes collide. `Villeurbanne` carries alias `'69'`, and if it owned a synonym
group, last-write-wins would rebind `'69'` away from `'lyon'`, breaking
`areRegionalSynonyms('lyon', '69')` and the test
_"matches Lyon with 69" → 'synonym'_.

```
for each entry e in catalog:
  canonical = normalizeLocationAlias(e.label)
  if e.metro is undefined OR canonical === e.metro:
      REGION_SYNONYMS[canonical] = e.aliases
  // else: suburb — handled by METRO_AREAS only
```

The synonym cache built from this (`alias → canonical`) is a **superset** of
the one built from the old `REGION_SYNONYMS` provided the catalog contains
every alias the old table had (see "Aliases restored for parity" below). The
old table's redundant secondary keys (`'ile de france'`, `'rhone'`,
`'bouche du rhone'`, …) are **not** needed: they existed only to seed the
inverse cache, and the inverse cache is already fully seeded by each alias
appearing once in its canonical entry's list.

### `deriveMetroAreas(catalog): Record<string, MetroAreaData>`

Group entries by `entry.metro`. For each metro name `M`:

```
cities       = [ normalizeLocationAlias(e.label) for e in catalog if e.metro === M ]
departments  = [ code for code in union(e.aliases) if /^\d{2,3}$/.test(code) ]
```

- `cities` includes the metro's own canonical entry (e.g. `'paris'`), matching
  the old `buildMetroAreaCache` behavior where `metroName → metroName` is set
  explicitly. Including it in `cities` is redundant but harmless and keeps the
  derivation uniform.
- `departments` captures petite + grande couronne department codes that appear
  as aliases of member cities (e.g. `92`, `93`, `94`, and now `78`, `91`, `77`,
  `95` for Paris).

The resulting tables must be a **superset** of the old ones (every old city and
department still present), so no previously-matching location can regress.

## Behavioral changes (additive, intentional)

Because the catalog is a superset of the old scorer tables, derivation
**adds** recognized places. Concretely vs. the old hardcoded tables:

1. **More synonyms**: every regional capital in the catalog (Rennes, Montpellier,
   Grenoble, …) now resolves as a canonical synonym group, so `matchLocation`
   can return `'synonym'`/`'partial'` for inputs that previously returned
   `'none'`. Strictly better.
2. **More nearby (Paris grande couronne)**: `METRO_AREAS.paris.departments`
   grows from `['92','93','94']` to include `'78','91','77','95'` (and `'75'`).
   A mission in Versailles (78) or Marne-la-Vallée (77) now scores `'nearby'`
   against a Paris profile instead of `'none'`. This is geographically correct
   and an explicit improvement.
3. **Aliases restored for parity**: the catalog must be enriched with the few
   aliases the old table had but the catalog lacks — `Paris 75`, `Paris 1er`,
   and `100% Remote` — so the derived synonym cache is a strict superset and no
   edge-case synonym match is lost.

The direction of every change is **toward a better match** (none → partial →
nearby → synonym → exact), never the reverse. This is the additivity guarantee.

## Non-regression guarantees (the Review checklist)

1. **No match can get worse.** Derived tables ⊇ old tables ⇒ for any input
   pair, the new `matchLocation` result is ≥ the old result on the quality
   order `none < partial < nearby < synonym < exact`.
2. **No synonym collision on department codes.** A department code (e.g.
   `'69'`, `'59'`) belongs to **exactly one** synonym group — the regional
   capital or metro canonical that owns it. Two cases are forbidden:
   - **Metro suburb** (Villeurbanne has `metro: 'lyon'`): `isSynonymCanonical`
     returns false, so it mints no group and never rebinds `'69'`.
   - **Secondary standalone city in the same department** (e.g. Dunkerque,
     Nord = 59): it must NOT declare `'59'`/`'nord'` as aliases, otherwise the
     scorer's last-write-wins cache rebinds `'59'` away from `'lille'` and
     `areRegionalSynonyms('lille', '59')` silently flips to `false`. Secondary
     cities stay suggestible by name only.
     Enforcement: `derive-location-tables.test.ts` asserts every 2-3 digit alias
     across `REGION_SYNONYMS` is owned by exactly one canonical.
3. **Existing tests stay green.** The disjoint-metro "does NOT match" cases
   (Nanterre↔Lyon, Villeurbanne↔Paris, Mérignac↔Toulouse, Blagnac↔Bordeaux)
   rely on disjoint metro memberships, which derivation preserves (a city's
   `metro` tag is unchanged).
4. **Saint-Quentin (without "-en-Yvelines") still → none vs Paris.** The string
   `"saint quentin"` is neither a member city (`'saint quentin en yvelines'`)
   nor a department code, so it cannot resolve to the Paris metro.
5. **Caches identical in shape.** `SYNONYM_CACHE`, `METRO_AREA_CACHE`, and
   `METRO_DEPARTMENT_CACHE` are built by the same functions as before; only the
   source constant changes.

## Invariants

1. **Single source of truth.** After this change, `core/scoring/` contains zero
   hardcoded French place data. All of it lives in `LOCATION_CATALOG`.
2. **Pure derivation.** `derive-location-tables.ts` is pure: no I/O, no async,
   no `Date`/`Math.random`. Covered by the `src/lib/core/**` mock-free coverage
   gate.
3. **Algorithm freeze.** `matchLocation`'s body is unchanged. The 428-line test
   file is the regression contract.
4. **Superset only.** Derived tables are a superset of the pre-change tables.
   The catalog is enriched (never pruned of scorer-relevant aliases) to make
   this hold.
5. **No schema/weight change.** `UserProfile.location`, `relevance.ts`, and
   `DEFAULT_SCORING_WEIGHTS` are untouched.

## Testing

- **New** `tests/unit/locations/derive-location-tables.test.ts` (mock-free):
  - every value in `REGION_SYNONYMS` is non-empty and normalized;
  - load-bearing synonym contracts are preserved (`paris ↔ 75 ↔ ile de france`,
    `lyon ↔ 69 ↔ rhone`, `marseille ↔ 13 ↔ bouches du rhone`, `remote ↔
teletravail`, standalone `nantes ↔ 44 ↔ loire atlantique`);
  - **anti-collision**: every department code (`/^\d{2,3}$/`) is owned by
    exactly one canonical synonym group;
  - suburbs (Villeurbanne, Nanterre, Aix-en-Provence, Mérignac, Blagnac) mint
    no synonym group;
  - `METRO_AREAS` has the expected metros; Paris cities include Nanterre;
    Paris departments include petite couronne (`75`,`92`,`93`,`94`) **and**
    grande couronne (`78`,`91`,`77`,`95`); Lyon owns `69` + city `villeurbanne`;
  - standalone places and remote variants are not metro areas;
  - derived department codes match `/^\d{2,3}$/`.
- **Existing** `tests/unit/scoring/location-matching.test.ts` must pass
  **unmodified** — this is the non-regression contract. If any assertion there
  flips, the derivation is wrong.
- **Regression**: `pnpm --filter @pulse/extension test:regression` stays green.
- **Full suite**: `pnpm --filter @pulse/extension typecheck && lint && test`.

## Migration

None. The tables are rebuilt at module load from the static catalog; no
persisted data references them. Existing stored `UserProfile.location` strings
and mission records are scored against the same algorithm with a superset
vocabulary — scores can only rise or stay equal, never drop, for a given input.

## Future

- Once derivation is stable, the old inline `MetroAreaData` type and the
  `buildSynonymCache`/`buildMetroAreaCache` helpers can be deduplicated into
  `core/locations/` too. Out of scope here to keep the diff reviewable.
- A curated `LOCATION_CATALOG` growth policy (who adds entries, review gate) —
  process concern, not modeled here.
