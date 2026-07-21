# Model: Copilot pilot metrics

## Purpose

Measure whether the closed Copilot pilot produces useful, reviewable content
without giving analytics any authority over product state. Metrics observe
durable transitions already accepted by the Copilot machines. They never
trigger, retry, approve, reject, bill, refund or delete a job.

No telemetry is emitted by the extension. No mission text, profile field,
evidence, generated result, provider session or free-form error is copied to an
analytics system. The initial implementation is a private server-side
projection over operational records that are deleted with their dossier.

## Immutable milestones

Each job may persist these timestamps once:

| Milestone          | Source transition                       | Rule             |
| ------------------ | --------------------------------------- | ---------------- |
| `reviewReadyAt`    | validated `JOB_REVIEW_READY` commit     | First value wins |
| `firstUncertainAt` | first transition to `uncertain`         | First value wins |
| `terminalAt`       | accepted, rejected, failed or cancelled | First value wins |

Existing authoritative timestamps remain:

- `createdAt`: idempotent admission of a new job;
- `providerDispatchedAt`: command may have reached Eve;
- `reviewedAt`: explicit user accept or reject;
- reservation/refund times: credit ledger entries, not duplicated analytics.

`providerDispatchedAt`, `reviewReadyAt`, `reviewedAt`, `firstUncertainAt` and
`terminalAt` are stamped by PostgreSQL. Application timestamps only signal that
the modeled transition occurred; they are never accepted as clock authority.
This keeps the ordering invariants valid when the Vercel and Supabase clocks
are skewed. Existing rows are normalized before the constraints are installed.
`providerDispatchedAt` may still be cleared when the provider adapter proves
that the attempted command could not have produced any remote effect; that
clear is business evidence, not a replacement timestamp.

Invariants:

1. `reviewReadyAt >= providerDispatchedAt` when both are known.
2. `reviewedAt >= reviewReadyAt`.
3. `terminalAt >= createdAt`.
4. `review`, `accepted` and `rejected` require `reviewReadyAt`.
5. `accepted`, `rejected`, `failed` and `cancelled` require `terminalAt`.
6. Idempotent retries never overwrite an existing milestone.
7. Deleting a dossier deletes its job facts; aggregate history may decrease.

Database functions may stamp a milestone after a modeled transition is
accepted. A timestamp trigger never decides whether a transition is allowed.

## Private facts

The service-role-only projection may contain job and dossier identifiers,
operation kind, bounded state/failure code, milestones, and net credits derived
from the existing ledger. It must not expose payloads, consent, evidence,
results, artifacts, provider handles, continuation tokens or error messages.

There is no public `/api/copilot/metrics` route. Cross-user aggregation belongs
to an operator/analytics role and must apply a reviewed minimum cell size before
export.

## KPI definitions

- **Approved-content rate:** dossier has at least one accepted non-analysis job.
  Cohort windows must state their maturity horizon; lifetime rate is diagnostic
  only because recent dossiers are right-censored.
- **Time to first usable draft:** dossier creation to the first explicit user
  acceptance of a non-analysis result. Publish p50/p90 with approval rate.
- **Time to review-ready:** dossier creation to first non-analysis
  `reviewReadyAt`; this is a driver, not a claim that the draft was useful.
- **Provider latency:** `reviewReadyAt - providerDispatchedAt`.
- **Error/refund rates:** terminal failures, first uncertainty, reservations and
  refunds from the authoritative ledger, segmented only by bounded operation
  kind, failure code and uncertainty phase.
- **Credit cost per dossier:** net credits reserved minus refunded. This is not
  monetary provider cost.

## Explicitly unavailable metrics

- **Eve monetary cost per dossier:** unavailable until a verified provider
  billing source exposes a stable record correlated to a provider run. Missing
  data is reported as `PROVIDER_BILLING_SOURCE_MISSING`, never `0 EUR`.
- **Premium retention:** unavailable until verified subscription events are
  stored prospectively in an idempotent append-only private history. The current
  profile status is not historical evidence. Causal impact additionally needs a
  reviewed comparison design.

## Privacy and rollout gate

The public privacy policy currently promises no tracking/analytics. Therefore
the private projection may be prepared and tested for the internal, default-off
pilot, but no public behavioral reporting or export is enabled before explicit
privacy review and policy reconciliation.
