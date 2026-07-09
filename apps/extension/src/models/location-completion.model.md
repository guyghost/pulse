# Location Completion Model

Source of truth for the **offline autocompletion** of the profile `location`
field. Companion to `onboarding-workmode-location.model.md` (which fixes what
onboarding _collects_) and to `core/scoring/location-matching.ts` (which
_consumes_ the normalized value). This change makes user input converge toward
the canonical vocabulary the scorer already understands — it does **not** add
geolocation, permissions, or any network call.

## Problem

`UserProfile.location` is a free-text string collected in two places:

- `OnboardingWizard.svelte` — `ob-location` input (placeholder `Paris, Lyon, Bordeaux…`).
- `ProfileSection.svelte` — `profileLocation` input (placeholder `Localisation`).

Both feed `core/scoring/location-matching.ts::matchLocation(missionLoc, profileLoc)`,
which only recognizes a hardcoded set of canonical names, regional synonyms
(`paris ↔ 75 ↔ ile de france`), and metropolitan areas (`nanterre → paris`).

Because the input is unconstrained, users type whatever a mission listing
showed them: typos, casing, accented variants, suburbs, or region names that
the synonym table does not cover. The result: `matchLocation` returns `'none'`
or `'partial'` for inputs that are _semantically_ correct, and the location
weight (`DEFAULT_SCORING_WEIGHTS.location = 20`) silently contributes 0. The
precision problem is a **vocabulary problem**, not a coordinates problem.

## Goal

Guide the user toward canonical place names with an **offline `<datalist>`**
backed by a pure catalog. No geolocation permission, no reverse-geocoding, no
backend, no new message types, no schema change. `location` stays a plain
`string`; the catalog only biases _what_ the user types.

## Non-goals

- No `geolocation` permission and no `navigator.geolocation` call. GPS returns
  coordinates; missions carry city _names_, so geolocation would require a
  reverse-geocoder (network or heavy offline DB) — rejected by the local-first
  principle. See `onboarding-workmode-location.model.md` "Out of scope".
- No change to `UserProfile` shape, bridge messages, or persistence.
- No change to `relevance.ts`, `DEFAULT_SCORING_WEIGHTS`, or the
  `matchLocation` **algorithm**. (The catalog is a data source; having
  `location-matching.ts` consume it is an explicit follow-up, see "Future".)
- No custom combobox component. Native `<datalist>` only — accessible,
  keyboard-friendly, stateless, zero JS runtime cost.

## Data source — `core/locations/location-catalog.ts`

New pure module. No I/O, no async, no side effects — covered by the mock-free
`src/lib/core/**` coverage gate.

```ts
export interface LocationEntry {
  /** Display label shown in the datalist, proper case with accents. */
  readonly label: string;
  /** Normalized forms (lowercase, unaccented) that should match this entry. */
  readonly aliases: readonly string[];
  /** Optional metro area the entry belongs to (informational). */
  readonly metro?: string;
}

export const LOCATION_CATALOG: readonly LocationEntry[];
```

### Seeding rules

1. **Derive, don't duplicate.** The seed is generated from the existing
   `REGION_SYNONYMS` and `METRO_AREAS` in `location-matching.ts`, then
   augmented with the missing French regional capitals (Rennes, Montpellier,
   Grenoble, Clermont-Ferrand, Dijon, Tours, Saint-Étienne, Le Mans, Aix-en-
   Provence, Amiens, Rouen, Caen, Metz, Nancy, Limoges, Annecy, Brest, Reims,
   Orléans, Toulon, Perpignan, Besançon, Angers, Poitiers, La Rochelle, etc.).
2. **Labels are human-readable.** Proper case + accents
   (`Île-de-France`, `Aix-en-Provence`, `Charenton-le-Pont`).
3. **Aliases are normalized** via the same rules as `normalizeLocation`
   (lowercase, accent-stripped, hyphens → spaces). Each entry must include at
   least its canonical name + department code where relevant.
4. **Deduplicated by label.** Two entries must not share a label; aliases may
   overlap (that is fine for display).
5. **Target size: ~120–160 entries** (regional capitals + department codes +
   the existing metro suburbs). Keeps the `<datalist>` snappy and the bundle
   small; no need to ship all 36 000 French communes.

> The catalog is a _display and suggestion_ layer. It is intentionally a
> separate constant from `REGION_SYNONYMS` / `METRO_AREAS` so this change does
> not perturb the scorer. A follow-up can make `location-matching.ts` derive
> its tables from the catalog.

## UI surface

Each surface renders its **own** `<datalist>` with a surface-scoped `id`, and
its input references it via `list=`:

- `OnboardingWizard.svelte` → `ob-location` input with
  `list="ob-location-catalog"` and `<datalist id="ob-location-catalog">`.
- `ProfileSection.svelte` → `profileLocation` input with
  `list="profile-location-catalog"` and
  `<datalist id="profile-location-catalog">` (rendered only in edit mode).

Native browser behavior handles filtering, keyboard navigation (↑/↓), and
selection. The text value remains fully editable — the datalist is a _hint_,
never a constraint. The bound state (`location` / `profileLocation`) is
unchanged; selecting a suggestion just writes the entry's `label` into it.

Because `<datalist>` is a document-level registry keyed by `id`, and both
surfaces can be mounted in the same side panel DOM at the same time, each
surface uses a distinct id (`ob-location-catalog` / `profile-location-catalog`)
rather than a single shared id. A shared id would collide when both inputs are
mounted simultaneously; per-surface ids keep the suggestion lists independent
and avoid duplicate-id DOM violations.

## States

No new state machine. The location field's local state already exists in the
companion model (`onboarding-workmode-location.model.md`):

```
location:  untouched ('') ──input/select──► filled (string) ──clear──► untouched
```

The datalist adds no state of its own: it is a stateless suggestion source.
Selecting a suggestion is just an `input` event that writes `entry.label`.

## Events

| Event            | Source                       | Effect                                             |
| ---------------- | ---------------------------- | -------------------------------------------------- |
| `LOCATION_INPUT` | text input / datalist select | `location` (or `profileLocation`) updated to value |

No new event types. `SUBMIT` / profile-save flows are unchanged.

## Data flow

```
LOCATION_CATALOG (pure data, core/locations/)
   │
   ▼
<datalist id="location-catalog">   ← rendered next to each location input
   │  list="location-catalog"
   ▼
<input bind:value={location | profileLocation}>
   │  SUBMIT / save (unchanged)
   ▼
UserProfile.location (string, unchanged shape)
   │
   ▼
matchLocation(mission.location, profile.location)   ← unchanged algorithm
```

Direction respects the architecture rule: **UI imports Core; Core never imports
UI.** The catalog is pure data in `core/`; the Svelte surfaces import it.

## Invariants

1. **Local-first.** No `geolocation` permission added to `manifest.json`, no
   network call, no third-party dependency. Completion is 100% offline.
2. **Schema-stable.** `UserProfile.location` remains `string`. No DB migration,
   no preprocessor change, no bridge message added.
3. **Scoring-stable.** `matchLocation`, `relevance.ts`, and
   `DEFAULT_SCORING_WEIGHTS` are unchanged. Precision improves _only_ because
   user input converges on canonical labels.
4. **Pure catalog.** `location-catalog.ts` has no I/O, no async, no
   `Date`/`Math.random`, no `console`. It is unit-tested without mocks and
   falls under the `src/lib/core/**` coverage gate.
5. **Hint, not constraint.** The input stays free text. A user can type a value
   absent from the catalog; it is stored verbatim and scored as today.
6. **Label uniqueness.** No two `LocationEntry` share the same `label`.
7. **Display parity.** The same catalog backs both `OnboardingWizard` and
   `ProfileSection`, so first-run and later edits propose the same vocabulary.

## Edge cases

- **User ignores suggestions** and types `tlon` (typo): stored verbatim,
  scored as today. Completion is opt-in; we do not autocorrect.
- **User types a suburb not in the catalog** (e.g. `Sceaux`): stored verbatim;
  `location-matching.ts` still resolves it if it is in `METRO_AREAS`.
- **Multi-value intent** (`Paris et Lyon`): the input is single-string; the
  datalist suggests one label at a time. Multi-location is out of scope (see
  `onboarding-workmode-location.model.md`).
- **i18n / non-France**: the catalog is France-centric, matching the current
  scorer scope. Adding countries is a future scope expansion, not a blocker.
- **Duplicate `<datalist>` ids** when both surfaces are mounted: each surface
  renders its own `<datalist>` with a stable, surface-scoped id
  (`ob-location-catalog`, `profile-location-catalog`) to avoid collisions.
- **Accessibility**: `<datalist>` is accessible by default; the existing
  `<label for="…">` associations are preserved. No new ARIA attributes needed.

## Testing

- **Unit (mock-free)** in `tests/unit/locations/location-catalog.test.ts`:
  - every entry has a non-empty `label` and ≥1 alias;
  - labels are unique;
  - aliases are normalized (no accents, lowercase);
  - seed coverage: every key of `REGION_SYNONYMS` and every city in
    `METRO_AREAS` is represented by at least one entry's alias;
  - regional capitals list (Rennes, Montpellier, …) is present.
- **Regression**: `pnpm --filter @pulse/extension test:regression` must stay
  green (no parser/scoring change).
- **Manual / E2E**: type `par` in onboarding → suggestions include `Paris`;
  type `aix` → `Aix-en-Provence`; selecting writes the canonical label.

## Future (explicitly out of scope here)

- ~~Make `location-matching.ts` **derive** `REGION_SYNONYMS` and `METRO_AREAS`
  from `LOCATION_CATALOG`, so the scorer and the completer share one source of
  truth.~~ **Delivered** — see `models/location-tables-derivation.model.md`.
  `core/locations/derive-location-tables.ts` now exports both tables, derived
  purely from the catalog; `location-matching.ts` imports them with its
  algorithm unchanged.
- Optional "use my location" button backed by `navigator.geolocation` + an
  offline reverse-geocoder, behind a user grant. Requires a separate model due
  to the local-first tension.
- Custom combobox with metro-area grouping if the datalist UX proves limiting.
