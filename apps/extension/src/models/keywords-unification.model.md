# Keywords Unification Model

Source of truth for the unification of the profile's `stack` (compétences) and
`searchKeywords` (mots-clés de recherche) into a single `keywords` list. This
model is the authoritative spec; the implementation in `core/`, `shell/`, `ui/`,
and tests must conform to it.

## Why

The profile historically exposed two parallel string lists:

- `stack: string[]` — fed **local scoring** only (`rawStackScore` matches
  `mission.stack` against `profile.stack`).
- `searchKeywords: string[]` — fed **connector API queries** only
  (`buildSearchContext` joins them into the free-text `query`).

This split is invisible to a non-technical user, who does not know whether a
term ("React", "SaaS", "marketplace") should go in "compétences" or
"mots-clés". The result is either duplicate entry or an empty second field and
a degraded experience. We collapse both into one list, **`keywords`**, that
serves both channels. "Il ne restera alors que les mots."

## Decision (confirmed by product)

The unified `keywords` list feeds **both**:

1. **Local scoring** — matched against `mission.stack` (tech terms hit; domain
   terms are scoring-neutral, see Invariants).
2. **Connector API query** — joined into the free-text `query` sent to every
   platform connector. `skills: []` stays empty by design (AND-logic on skill
   arrays over-narrows results; see `search-context.ts` architect note).

This is a **full merge**, not a cosmetic single input over two hidden fields.

## Data shape

### `UserProfile` (after)

```ts
export interface UserProfile {
  firstName: string;
  keywords: string[]; // ← was: stack: string[]
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
  scoringWeights?: ScoringWeights;
  // searchKeywords: string[]  ← REMOVED (folded into keywords)
}
```

### What is NOT renamed (deliberate)

| Symbol                                     | Why it keeps its name                                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mission.stack`                            | Parsed from platform HTML; represents the mission's tech stack — a different concept.                                                                                                               |
| `ScoringWeights.stack`                     | Name of the scoring **dimension** (stack-match), not the profile field.                                                                                                                             |
| `DEFAULT_SCORING_WEIGHTS.stack`            | Same — dimension weight.                                                                                                                                                                            |
| `DeterministicBreakdown.stack`             | Score breakdown per dimension.                                                                                                                                                                      |
| `ConnectedAlertPreferences.requiredStacks` | Cross-app contract: synced to the `apps/dashboard` PostgreSQL `required_stacks` column via `connected-dashboard.ts`. Renaming would break cloud sync. Semantically still "required mission stacks". |
| `AlertHistoryEntry.requiredStacks`         | Persisted alert history; shares the contract above.                                                                                                                                                 |
| `SmartAlertCriteria.requiredStacks`        | Same.                                                                                                                                                                                               |

The scoring dimension `stack` keeps its name because it answers "how much of
the **mission's** tech stack does the user cover?" — that question is
unchanged. Only the **profile's** input list is renamed `stack` → `keywords`.

## Scoring semantics (unchanged behavior)

`rawStackScore(missionStack, profileKeywords)`:

```
denominator = missionStack.length
numerator   = count of missionStack entries present in profileKeywords (lowercased set)
score       = numerator / denominator * 100
```

**Invariant (scoring-neutral merge):** the denominator is `missionStack.length`
and the loop iterates `missionStack`, not `profileKeywords`. Adding domain
terms ("SaaS", "marketplace") to `profileKeywords` that never appear in any
mission's `stack` does **not** change the score — they are simply never matched
in the membership check. Therefore merging `searchKeywords` (domain terms)
into `keywords` is scoring-neutral for every existing profile.

Edge cases:

- `profileKeywords.length === 0` → returns `100` (no constraint; same as today).
- `missionStack.length === 0` → returns `0` (same as today).

## Search semantics

`buildSearchContext(profile, lastSync)`:

```
query = profile.keywords.map(trim + collapse spaces).filter(nonEmpty).join(' ')
skills = []   // unchanged: server-side skill filtering stays disabled
```

Behavior is identical to today's `searchKeywords`-derived query; the source
field changes from `searchKeywords` to `keywords`.

## Profile impact (completion radar)

The two separate impact items are merged into one:

| Before                          | Weight | After       | Weight |
| ------------------------------- | ------ | ----------- | ------ |
| `stack` ("Stack technique")     | 25     | `keywords`  | 35     |
| `search-keywords` ("Mots-clés") | 10     | _(removed)_ | —      |

`ProfileImpactFieldId` loses `'search-keywords'`; `'stack'` → `'keywords'`.
`ProfileImpactInput` follows (`stack` → `keywords`, drop `searchKeywords`).
Total weight budget stays 100 (25+10 → 35; all other items unchanged).

## State modules

`settings-page.svelte.ts` and `feed-page.svelte.ts` expose a single keyword
editor surface:

| Before                                                                  | After                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `profileStack` / `stackInput` / `addStack` / `removeStack` / `setStack` | `profileKeywords` / `keywordInput` / `addKeyword` / `removeKeyword` / `setKeywords` |
| `searchKeywords` / `keywordInput` / `addKeyword` / `removeKeyword`      | _(removed — folded into above)_                                                     |

The two former input buffers collapse into one (`keywordInput`).

## UI

- **Onboarding** (`OnboardingWizard.svelte`): the "compétences" step becomes a
  single "Mots-clés" input. The onboarding still seeds
  `ConnectedAlertPreferences.requiredStacks` from the profile's keywords
  (existing wiring; `requiredStacks: keywords`). The field name
  `requiredStacks` is unchanged (cross-app contract).
- **Profile** (`ProfileSection.svelte`): the two sections ("Stack technique" +
  "Mots-clés") become a single "Mots-clés" section.
- Labels are non-technical: placeholder copy invites both technologies and
  domains ("React, Node, SaaS, marketplace, fintech…").

## Persistence & migration

Two independent resilience layers (belt + suspenders). Both are required.

### Layer 1 — Read-time schema shim (resilience)

`UserProfileSchema` gains a `z.preprocess` step: when raw data has no
`keywords` field but has `stack` and/or `searchKeywords`, it merges them into
`keywords` (dedup, case-insensitive, first-seen casing wins — same rule as
`appendUniqueNormalized`) before validation. This makes `getProfile()` /
`parseUserProfile()` tolerate legacy records even if the data migration has
not run yet (downgrade-reupgrade, skipped migration, synced-from-cloud edge).

### Layer 2 — Data migration v1 → v2

`APP_DATA_VERSION` bumps `1 → 2`. A new entry in `DATA_MIGRATIONS`
(`migration-registry.ts`) rewrites the `profile` store record:

1. Read the single `profile` record (`keyPath: 'id'`, key `'current'`).
2. If it already has `keywords` → no-op (idempotent).
3. Else merge `[...(record.stack ?? []), ...(record.searchKeywords ?? [])]`
   using `appendUniqueNormalized` semantics, set `record.keywords`, delete
   `record.stack` and `record.searchKeywords`, `put` back.
4. If no record exists → no-op.

The migration is pure-data, idempotent, and never delegates decisions to an
LLM (db-migration.model.md invariant). `DB_VERSION` (structural) is unchanged
— no store/index is added.

### Write path

`saveProfile()` writes the new shape (`keywords`, no `stack`/`searchKeywords`).
`UserProfileSchema.safeParse` in `saveProfile` validates the new shape; the
preprocess shim is a no-op for already-new records.

## Invariants

1. **No silent data loss.** A legacy profile (`stack` + `searchKeywords`) is
   always readable, via the shim (Layer 1) and/or the migration (Layer 2).
2. **Scoring-neutral merge.** Adding domain keywords never lowers an existing
   mission's stack-match score (denominator is `missionStack.length`).
3. **Idempotent migration.** Running v1→v2 twice is a no-op.
4. **FC&IS.** `keywords` lives on the pure `UserProfile` type; all I/O
   (migration, save/load) stays in `shell/`. Core never imports shell.
5. **Cross-app contracts preserved.** `requiredStacks` (alerts) and the
   dashboard sync are untouched.
6. **No `any`.** The preprocess shim is typed via `unknown` + narrowing.

## Out of scope

- Renaming `Mission.stack`, `ScoringWeights.stack`, `requiredStacks` (see table).
- Changing alert filtering semantics (`SmartAlertCriteria` unchanged).
- Dashboard (`apps/dashboard`) schema changes — none required.
