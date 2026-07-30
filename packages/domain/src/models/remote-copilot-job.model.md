# Remote Copilot Job Model

## Purpose

Coordinate one server-owned Copilot operation. Analysis costs zero credits;
`pitch`, `cover-message`, `cv-summary` and `tjm-coach` cost one credit.

## States

```text
idle -> authorizing -> reserving? -> queued -> running -> validating -> review
review -- USER_ACCEPTED --> accepted
review -- USER_REJECTED --> rejected

authorizing -> failed                 auth/entitlement/ownership refusal
reserving -> failed                   insufficient credit or reserve failure
queued|running|validating -> failed   provider/schema failure (free job)
queued|running|validating -> refunding -> failed   paid failure
queued|running -> cancelling -> cancelled          free cancellation
queued|running -> cancelling -> refunding -> cancelled  paid cancellation
```

A failed attempt is terminal. An explicit user retry starts a new logical job
from the dossier's `ready` state with a new `jobId`, `attemptId`, idempotency
key and billing key. It therefore receives a fresh quota slot and, for paid
content, a fresh credit reservation. Transport recovery of the original job is
limited to its canonical idempotent RPCs and is not a user retry.

## Events and Evidence

All provider/payment events repeat `jobId`, `userId` and `attemptId`.
Reservation/refund events also repeat the deterministic `idempotencyKey`.
Provider content is never an event type.

## Invariants

1. Authorization and ownership precede any credit mutation or Eve call.
2. A paid attempt has at most one successful reservation and one successful
   refund; a successful reviewed result is never refunded.
3. `review` requires a schema-valid result. Invalid output is a failed attempt.
   Artifact results contain no free-form draft: every ordered draft segment is
   grounded by typed, allowlisted source refs and the server assembles the
   review/copy text only after validation.
4. `accepted` and `rejected` record user review only; they do not mutate the
   application pipeline.
5. Cancel is explicit. A transport timeout is `uncertain` until the durable job
   is reconciled; it is not blindly retried.
6. Duplicate `CREATE_JOB` with the same idempotency key returns the canonical
   job and cannot start a second Eve run.
7. A user retry never reopens a terminal job or reuses its billing identity. It
   creates a new logical job after fresh consent confirmation. This prevents a
   refunded reservation from authorizing a later provider run for free.
8. Pilot admission is an atomic pre-job guard: 10 analysis jobs and 20 total
   jobs per user per UTC day. A canonical transport retry with the same
   idempotency key is checked before this guard and cannot consume another
   quota slot; a new user-requested job does consume one.
9. Durable recovery is phase-specific: `reserving` replays only the idempotent
   reserve RPC; `queued` may dispatch only when no provider dispatch timestamp
   exists; `refunding` replays only the idempotent refund RPC. A `running` job
   or any job with a possible provider dispatch and no durable result moves to
   `uncertain`, because Eve 0.26.2 offers no lookup authority.
10. A dossier session becomes continuation-eligible only after
    `USER_ACCEPTED`. The next job claims and disables that eligibility before
    dispatch. Rejected, cancelled, invalid and failed turns cannot seed later
    prompts.
11. Recording a provider handle and proving `provider_disposition_known` is one
    database transition. No crash may leave a durable handle without its job
    proof, or a proof without the matching handle.
12. A terminal transition that does not require a credit mutation commits the
    job terminal state and the dossier return to `ready` in one transaction.
    This covers entitlement/credit admission refusal before reservation, free
    analysis failure, free cancellation and idempotent terminal healing.
13. A provider-session `activeJob` is valid only when `jobId + userId +
dossierId` identify the same durable job. Cross-dossier bindings are
    structurally impossible, not merely rejected by application code.
14. The dossier persists the currently active `jobId` from admission through
    review/refund. Stage, review, no-credit settlement and refund must match
    that exact ID before clearing it. A late terminal retry from an older job
    cannot return a dossier occupied by a newer job to `ready`.
15. An existing provider-session row cannot be rebound by record/stage. Only
    the explicit accepted-continuation claim may move its `activeJobId`; every
    later record/stage must observe that already-correlated ID.
16. Job admission consumes a durable UTC-day counter that is independent of
    dossier/job cascade deletion. A non-expired payload-free deletion receipt
    for the same user/idempotency key returns `GONE` before quota, credit or
    provider effects.
17. An idempotency key is canonical only for the same input hash, dossier and
    operation kind. Any mismatch is a conflict and performs no dossier, quota,
    credit or provider effect.
18. Every API read/duplicate path capable of resuming reservation, refund or
    provider work revalidates rollout and active entitlement first. Auth-only
    dossier reads, cancellation, terminal user review and deletion may recover
    or settle owner-controlled data after expiry/revocation, but never dispatch
    new provider work or mutate credits. A later continuation still requires a
    newly authorized job.
19. Multi-row settlement follows one lock order: dossier serialization row,
    then correlated job row, then ledger/profile rows. Refund and no-credit
    retries never invert that order against deletion.
20. A durable `cancelling` checkpoint is resumable after process loss. The
    service replays only a provable cancellation obligation: no provider
    handle means no remote effect; a known handle uses the idempotent provider
    cancellation/reconciliation path. Terminalization still uses the matching
    refund or no-credit transaction.
21. A deleted-job receipt is payload-free and blocks replay only until its
    database expiry. Expired receipts are physically removed by a bounded,
    service-role-only purge. Admission/replay checks opportunistically purge a
    batch, while a daily authenticated maintenance run drains all expired
    batches. The operational deletion target is no later than 25 hours after
    `expiresAt`; a missed maintenance run is a production alert and prevents a
    stronger public retention claim.

## Review Coverage

- Included analysis and each one-credit content kind.
- Entitlement denial, insufficient credits and wrong dossier owner.
- Duplicate requests before/after reservation and after completion.
- Provider timeout, invalid schema, cancellation and refund failure.
- Crash after reservation, provider completion or refund; reconciliation must
  settle exactly once.
- Crash while recording a provider handle or a no-credit terminal transition;
  observers must see either the complete before-state or complete after-state.
- A session cannot bind to a job from another owner or dossier, including via
  direct service-role SQL.
- Late refund/settlement for job A after job B starts must be rejected without
  changing job B or the dossier; record/stage cannot rebind job A's session.
- Stale provider/refund results from an older attempt.
- Deleted-job replay after a lost DELETE response, and quota reset attempts by
  deleting a dossier.
- Restart from `cancelling` before provider cancellation, after confirmed
  cancellation and before refund/no-credit terminalization.
- Retryable terminal failure followed by a fresh user-created job with distinct
  job, attempt, idempotency and billing identities.
- Physical deletion of expired receipts, including more than one bounded
  batch, unauthorized maintenance calls and a missed-run alert boundary.
