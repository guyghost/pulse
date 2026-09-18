# Parsing Confidence & Review Queue Model

## Scope

Source of truth for the « À vérifier » review queue: which scraped missions are flagged as
low extraction-confidence, how their confidence is computed, and how user review decisions
(keep / dismiss) are recorded.

Covers: confidence signals, confidence formula, flag threshold, review states and
transitions, pure derivation of the flagged list, and persistence ownership.

Does **not** cover: feed ordering, connector scheduling, or semantic scoring. A review
decision never changes a mission's score or its presence in the main feed (explicit scope
decision — the queue is an extraction-quality surface, not a feed filter).

No LLM output may decide flagging, confidence, or a review transition. The LLM produces
signals; the model decides.

## Inputs

- `Mission[]`: the current mission catalogue (post-dedup feed input).
- External signals, injected by the caller:
  - near-duplicate relations from `core/scoring/dedup.ts` (`deduplicateMissionsDetailed`).
  - `ConnectorHealthRecord[]` from `core/connectors/parser-health-logic.ts` marking suspect
    parsers.
- `ReviewDecisionMap`: persisted user decisions (`kept` / `dismissed`), loaded by the Shell.

## Low-confidence signals

| Signal id           | Fires when                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tjm_missing`       | `tjm === null` **and** no announced range (`tjmMin == null && tjmMax == null`).                                                           |
| `date_ambiguous`    | `startDate` or `publishedAt` present but malformed/unparseable, **or** both absent (no date information at all).                          |
| `incomplete_fields` | trimmed `title` shorter than `MIN_TITLE_LENGTH` (8) **or** trimmed `description` shorter than `MIN_DESCRIPTION_LENGTH` (40).              |
| `near_duplicate`    | mission appears as `duplicateMissionId` in a dedup relation at the canonical threshold (0.8).                                             |
| `parser_suspect`    | the mission's source connector has a health record for which `deriveParserHealthAlert` returns an alert (anomalous zero-results pattern). |

`tjm_missing`, `date_ambiguous` and `incomplete_fields` are derived purely from the mission.
`near_duplicate` and `parser_suspect` are context signals supplied by the caller (dedup and
parser health are computed once per scan, not per mission).

## Confidence formula

```
confidence = clamp01(1 − Σ weights(active signals))
```

| Signal              | Weight |
| ------------------- | ------ |
| `tjm_missing`       | 0.30   |
| `date_ambiguous`    | 0.20   |
| `incomplete_fields` | 0.20   |
| `near_duplicate`    | 0.30   |
| `parser_suspect`    | 0.15   |

Result is clamped to `[0, 1]` and rounded to 2 decimals.

## Flag threshold

`FLAG_THRESHOLD = 0.75`. A mission is **flagged** iff `confidence < 0.75`.

A mission with no signal has confidence `1` and is never flagged. A flagged mission always
has at least one active signal.

## Review states

| State       | Meaning                                          | Terminal |
| ----------- | ------------------------------------------------ | -------- |
| `unflagged` | Confidence ≥ threshold; not shown in the queue.  | Yes      |
| `flagged`   | Confidence < threshold and no recorded decision. | No       |
| `kept`      | User validated the extraction (« Garder »).      | Yes      |
| `dismissed` | User rejected the mission (« Ignorer »).         | Yes      |

## Events And Transitions

| Event             | From        | Guard                                    | To          | Effect                                                           |
| ----------------- | ----------- | ---------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `flag`            | `unflagged` | computed confidence < `FLAG_THRESHOLD`   | `flagged`   | mission appears in the derived queue                             |
| `recompute`       | `flagged`   | mission or signals changed               | `flagged`   | confidence, reasons and order recomputed (pure derivation)       |
| `recompute_clear` | `flagged`   | recomputed confidence ≥ `FLAG_THRESHOLD` | `unflagged` | mission leaves the queue                                         |
| `keep`            | `flagged`   | user action, mission currently flagged   | `kept`      | decision `{ status: 'kept', decidedAt }` persisted by Shell      |
| `dismiss`         | `flagged`   | user action, mission currently flagged   | `dismissed` | decision `{ status: 'dismissed', decidedAt }` persisted by Shell |

### Forbidden transitions

- `kept` / `dismissed` → `flagged`: a decided mission never re-enters the queue (its
  decision wins over any recomputation, even if confidence changes).
- `unflagged` → `kept` / `dismissed`: decisions only apply to currently flagged missions;
  the derivation ignores decisions for missions that are absent or unflagged (stale
  decisions are inert, never resurrected).
- Any transition driven by free text, LLM output, or semantic reason. Only the pure
  confidence computation and explicit user actions decide.

## Derivation (pure)

`deriveReviewQueue(missions, decisions, duplicateMissionIds, suspectConnectorIds)` returns
the flagged entries:

- excludes missions with a recorded decision (`kept` or `dismissed`);
- excludes missions with confidence ≥ `FLAG_THRESHOLD`;
- sorts by confidence ascending (worst extraction first);
- attaches per-entry: mission, confidence, active signal ids, primary reason label.

Primary reason label (first active signal in this fixed order):
`tjm_missing` → « TJM manquant », `date_ambiguous` → « Date ambiguë »,
`near_duplicate` → « Doublon potentiel », `incomplete_fields` → « Champs incomplets ».
`parser_suspect` has no reason label; it switches the item icon to the alert variant.

## Invariants

1. `confidence ∈ [0, 1]` for every mission.
2. A `dismissed` mission never reappears in the queue.
3. A `kept` mission never reappears in the queue.
4. The queue is a pure function of `(missions, decisions, dedup relations, parser health,
FLAG_THRESHOLD)` — no hidden state, no I/O in the derivation.
5. Every flagged entry has ≥ 1 active signal; every entry's confidence < `FLAG_THRESHOLD`.
6. Decisions are immutable once recorded (no un-decide in v1; re-flagging after a new scan
   is handled by the forbidden-transition rules above).
7. Review decisions never mutate missions, scores, or the main feed.

## Persistence (Shell)

- Storage: `chrome.storage.local`, key `reviewQueueDecisions`, shape
  `Record<missionId, { status, decidedAt }>`, capped to the most recent
  `MAX_REVIEW_DECISIONS` (2000) entries.
- Owner: `shell/storage/review-decisions.ts`, exposed to the UI through
  `shell/facades/review-queue.facade.ts`. The side panel never touches `chrome.*` directly.
- Writes are fire-and-forget from the UI's perspective: an in-memory decision applies
  immediately; a failed write is logged by the Shell and must not roll back the transition
  (reloading the page re-derives from the last persisted map — worst case the mission is
  flagged again, which is safe).

## Review Checklist

- Nominal: mission with missing TJM only → confidence 0.70 → flagged with « TJM manquant ».
- Errors: malformed dates/fields tolerated (signals, not throws); unknown connector ids in
  health records are ignored.
- Cancellations/retries: not applicable — derivation is stateless; persistence is
  last-write-wins per decision.
- Permissions: not applicable — decisions live in local storage, no host access.
- Terminal states: every mission ends as `unflagged`, `kept` or `dismissed` in the queue
  view; `flagged` is always transient.
- Forbidden: LLM/free-text driven transitions (see above); feed mutation from the queue.
